import React, { useState, useEffect } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import { usePropertyStore } from "@/services/store";
import match from "autosuggest-highlight/match";
import parse from "autosuggest-highlight/parse";

interface Property {
  address: string;
  constructionYear: string;
  housingCount: string;
  heatedArea: string;
  exteriorSpace: "common" | "private" | "roofTerrace";
  [key: string]: string | object | number;
}

export type FeatureCollection = {
  geometry: {
    coordinates: [lon: number, lat: number];
    type: "Point";
  };
  properties: {
    city: string | undefined;
    citycode: string | undefined; // INSEE code
    context: string | undefined;
    housenumber: string | undefined;
    id: string | undefined;
    importance: number | undefined;
    label: string;
    name: string | undefined;
    postcode: string | undefined;
    score: number | undefined;
    street: string | undefined;
    type: string | undefined;
    x: number | undefined;
    y: number | undefined;
  };
  type: "Feature";
};

const BAN_URL = "https://api-adresse.data.gouv.fr/search/";
const defaultMaxResults = 7;
const ERREUR_RESEAU = "Erreur réseau lors de l'appel à la BAN";
const minCharactersBeforeFetching = 5;

export const fetchBAN = async (query: string): Promise<{ features: FeatureCollection[] }> => {
  const searchParams = new URLSearchParams({
    q: query,
    limit: defaultMaxResults.toString(),
    type: "housenumber",
    autocomplete: "1",
  });

  const banRequest = new Request(BAN_URL + "?" + searchParams.toString());

  try {
    const response = await fetch(banRequest);

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const proposals = (await response.json()) as { features: FeatureCollection[] };
    return proposals;
  } catch (err) {
    console.error(ERREUR_RESEAU, err);
    throw new Error(ERREUR_RESEAU);
  }
};

const AutocompleteBan = () => {
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<readonly FeatureCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [debouncedInputValue, setDebouncedInputValue] = useState("");
  const { property, setProperty } = usePropertyStore((state: any) => ({
    property: state.property as Property,
    setProperty: state.setProperty,
  }));
  const [value, setValue] = useState<FeatureCollection | null>(
    property?.address
      ? {
          type: "Feature",
          properties: {
            label: property.address,
            city: undefined,
            citycode: undefined,
            context: undefined,
            housenumber: undefined,
            id: undefined,
            importance: undefined,
            name: undefined,
            postcode: undefined,
            score: undefined,
            street: undefined,
            type: undefined,
            x: undefined,
            y: undefined,
          },
          geometry: {
            coordinates: [property.lon as number, property.lat as number],
            type: "Point",
          },
        }
      : null
  );
  // Simple debounce implementation
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInputValue(inputValue);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [inputValue]);

  // Fetch initial data if defaultInputValue is provided
  useEffect(() => {
    const fetchInitialData = async () => {
      if (property.address) {
        try {
          const proposals = (await fetchBAN(inputValue)).features;
          console.log(proposals);
          setValue(proposals[0] || null);
          setOptions(proposals);
        } catch (error) {
          console.error(error);
        }
      }
    };

    fetchInitialData();
  }, [property.address]);

  // Fetch data when input changes
  useEffect(() => {
    const fetchData = async () => {
      if (debouncedInputValue.length > minCharactersBeforeFetching) {
        setLoading(true);
        try {
          const proposals = (await fetchBAN(debouncedInputValue)).features;
          setOptions(proposals);
        } catch (error) {
          console.error(error);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchData();
  }, [debouncedInputValue]);

  return (
    <Autocomplete
      id="ban-autocomplete"
      getOptionLabel={(option) => (typeof option === "string" ? option : option.properties.label)}
      filterOptions={(x) => x}
      options={options}
      autoComplete
      includeInputInList
      filterSelectedOptions
      value={value}
      noOptionsText="Pas de résultat"
      isOptionEqualToValue={(option, value) => option.properties.label === value?.properties?.label}
      onChange={(_event: unknown, newValue: FeatureCollection | null) => {
        setOptions(newValue ? [newValue, ...options] : options);
        setValue(newValue);
        setProperty({ address: newValue?.properties.label || "", lat: newValue?.geometry.coordinates[1] || 0, lon: newValue?.geometry.coordinates[0] || 0 });
      }}
      onInputChange={(_event, newInputValue) => {
        setInputValue(newInputValue);
      }}
      disablePortal={true}
      slotProps={{
        popper: {
          placement: "bottom-start",
          modifiers: [
            {
              name: "flip",
              enabled: false,
            },
          ],
        },
      }}
      sx={{
        "& .MuiOutlinedInput-root": {
          padding: "0",
          fontFamily: "'Marianne', sans-serif",
          "& fieldset": {
            border: "2px solid #2e7d32", // green-800 equivalent
            borderRadius: "0.375rem",
          },
          "&:hover fieldset": {
            border: "2px solid #2e7d32",
          },
          "&.Mui-focused fieldset": {
            border: "2px solid #9274B6", // purple-secondaryDarker equivalent
          },
        },
        "& .MuiInputLabel-root": {
          display: "none",
        },
        "& .MuiAutocomplete-input": {
          padding: "0.5rem 0.75rem !important",
          fontWeight: "700",
          color: "#4b5563", // text-primary-light equivalent
          fontFamily: "'Marianne', sans-serif",
        },
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="8 Boulevard de la Libération, 93200 Saint-Denis"
          fullWidth
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={20} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      renderOption={(props, option) => {
        if (!inputValue) return null;

        // Make words matching the input bold.
        const matches = match(option.properties.label, inputValue);
        const parts = parse(option.properties.label, matches);

        // Destructure props to remove the key property that React doesn't want passed
        const { key, ...rest } = props as { key: string; [key: string]: any };

        return (
          <li key={option.properties.label} {...rest}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", width: "44px" }}>
                <span>📍</span>
              </div>
              <div style={{ width: "calc(100% - 44px)", wordWrap: "break-word" }}>
                {parts.map((part: { text: string; highlight: boolean }, index: number) => (
                  <span key={index} style={{ fontWeight: part.highlight ? "bold" : "normal" }}>
                    {part.text}
                  </span>
                ))}
              </div>
            </div>
          </li>
        );
      }}
    />
  );
};

export default AutocompleteBan;

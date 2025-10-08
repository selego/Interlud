import { useEffect, useState } from "react";
import { usePropertyStore } from "@/services/store";

const MAPBOX_TOKEN = "pk.eyJ1IjoibGVvcG9sZHNlbGVnbyIsImEiOiJjbTJyeHl2cWQxbDVpMnJzYnl1aWJmMDJsIn0.3jwSQ3iHIaJifEcbOn0NvA";

interface MapboxStaticImageProps {
  width?: number;
  height?: number;
  zoom?: number;
  style?: React.CSSProperties;
  mapStyle?: string;
  pitch?: number;
  bearing?: number;
}

const GeoCodeImage = ({ width = 600, height = 400, zoom = 15 }: MapboxStaticImageProps) => {
  const { property } = usePropertyStore((state: any) => ({
    property: state.property,
  }));

  const [imageUrl, setImageUrl] = useState<string>("");

  useEffect(() => {
    if (property.lat && property.lon) {
      // Créer l'URL pour l'image statique Mapbox avec un style 3D
      const mapboxUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/pin-s+ff0000(${property.lon},${property.lat})/${property.lon},${property.lat},${zoom},0/${width}x${height}?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
      setImageUrl(mapboxUrl);
    }
  }, [property.lat, property.lon, width, height, zoom]);

  if (!property.lat || !property.lon) {
    return <div>Veuillez sélectionner une adresse pour afficher la carte</div>;
  }

  return (
    <div style={{ width, height }}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`Carte de ${property.address}`}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "8px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          }}
        />
      ) : (
        <div>Chargement de la carte...</div>
      )}
    </div>
  );
};

export default GeoCodeImage;

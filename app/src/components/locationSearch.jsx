import React, { useState } from "react"
import { Autocomplete } from "@react-google-maps/api"

const LocationSearch = ({ apiKey }) => {
  const [autocomplete, setAutocomplete] = useState(null)

  const onLoad = (autocomplete) => {
    setAutocomplete(autocomplete)
  }

  return (
    <div className="p-4">
      <Autocomplete onLoad={onLoad} onPlaceChanged={onPlaceChanged} options={{ apiKey: apiKey }}>
        <input type="text" placeholder="Search location" className="w-full p-2 border border-gray-300 rounded" />
      </Autocomplete>
    </div>
  )
}

export default LocationSearch

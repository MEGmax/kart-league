import { createContext, useCallback, useContext, useState } from "react";
import Snackbar from "@mui/material/Snackbar";

const FlashContext = createContext(() => {});

export function FlashProvider({ children }) {
  const [msg, setMsg] = useState({ text: "", key: 0 });
  const flash = useCallback((text) => setMsg((m) => ({ text, key: m.key + 1 })), []);
  return (
    <FlashContext.Provider value={flash}>
      {children}
      <Snackbar
        key={msg.key}
        open={!!msg.text}
        message={msg.text}
        autoHideDuration={4500}
        onClose={(_, reason) => { if (reason !== "clickaway") setMsg((m) => ({ ...m, text: "" })); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </FlashContext.Provider>
  );
}

export function useFlash() {
  return useContext(FlashContext);
}

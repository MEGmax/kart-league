// "Upload photos": opens the phone's photo picker right away (several at once) and takes the chosen
// photos to the Upload page, where Gemini reads them. Admins only (the Upload page checks too).
import { useNavigate } from "react-router-dom";
import Button from "@mui/material/Button";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import { handOffFiles } from "../lib/handoff";

export default function PhotoPickButton({ label = "Upload photos", variant = "outlined", size = "medium", sx }) {
  const navigate = useNavigate();
  function picked(e) {
    const list = e.target.files;
    if (!list || !list.length) return;
    handOffFiles(list);
    e.target.value = "";
    navigate("/upload");
  }
  return (
    <Button component="label" variant={variant} size={size} startIcon={<AddPhotoAlternateOutlinedIcon />} sx={{ whiteSpace: "nowrap", ...sx }}>
      {label}
      <input type="file" accept="image/*" multiple hidden onChange={picked} />
    </Button>
  );
}

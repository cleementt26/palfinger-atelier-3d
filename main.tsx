import { createRoot } from "react-dom/client";
import CraneStudio from "@/components/crane/studio";
import "./app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Élément racine de l’atelier 3D introuvable.");

createRoot(root).render(<CraneStudio />);

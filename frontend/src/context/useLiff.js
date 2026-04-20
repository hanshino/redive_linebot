import { useContext } from "react";
import { LiffContext } from "./LiffContext";

export default function useLiff() {
  return useContext(LiffContext);
}

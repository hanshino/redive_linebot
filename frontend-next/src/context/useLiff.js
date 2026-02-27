import { useContext } from "react";
import { LiffContext } from "./LiffProvider";

export default function useLiff() {
  return useContext(LiffContext);
}

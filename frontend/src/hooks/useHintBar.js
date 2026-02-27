import { useState, useCallback } from "react";

export default function useHintBar() {
  const [state, setState] = useState({ open: false, message: "", severity: "info" });

  const handleOpen = useCallback((message, severity = "info") => {
    setState({ open: true, message, severity });
  }, []);

  const handleClose = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  return [state, { handleOpen, handleClose }];
}

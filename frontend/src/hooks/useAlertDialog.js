import { useState, useCallback } from "react";

export default function useAlertDialog() {
  const [state, setState] = useState({
    open: false,
    title: "",
    description: "",
    submitText: "確認",
    cancelText: "取消",
    onSubmit: null,
    onCancel: null,
  });

  const handleOpen = useCallback((detail) => {
    setState((prev) => ({ ...prev, ...detail, open: true }));
  }, []);

  const handleClose = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  return [state, { handleOpen, handleClose }];
}

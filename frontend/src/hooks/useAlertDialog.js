import { useState, useCallback } from "react";

const DEFAULTS = {
  title: "",
  description: "",
  submitText: "確認",
  cancelText: "取消",
  destructive: false,
  busy: false,
  onSubmit: null,
  onCancel: null,
};

export default function useAlertDialog() {
  const [state, setState] = useState({ ...DEFAULTS, open: false });

  // 每次開啟都從預設值開始，避免上一次的 destructive / submitText 殘留到下一個確認框
  const handleOpen = useCallback(detail => {
    setState({ ...DEFAULTS, ...detail, open: true });
  }, []);

  const handleClose = useCallback(() => {
    setState(prev => ({ ...prev, open: false, busy: false }));
  }, []);

  const setBusy = useCallback(busy => {
    setState(prev => ({ ...prev, busy }));
  }, []);

  return [state, { handleOpen, handleClose, setBusy }];
}

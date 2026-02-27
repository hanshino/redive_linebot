import { useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { FullPageLoading } from "../components/Loading";

export default function LiffLayout() {
  const { size } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    window.localStorage.setItem("liff_size", size);
    const redirectUri = searchParams.get("reactRedirectUri") || "/";
    navigate(redirectUri, { replace: true });
  }, [size, searchParams, navigate]);

  return <FullPageLoading />;
}

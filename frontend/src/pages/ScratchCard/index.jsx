import { useEffect } from "react";
import useAxios from "axios-hooks";
import { Grid, Alert, AlertTitle } from "@mui/material";
import { get } from "lodash";
import AlertLogin from "../../components/AlertLogin";
import { FullPageLoading } from "../../components/Loading";
import CharacterCard from "../../components/CharacterCard";
import useLiff from "../../context/useLiff";

export default function ScratchCard() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [{ data = [], loading }, fetchData] = useAxios("/api/scratch-cards", {
    manual: true,
  });
  const [{ data: totalData = 0, loading: totalLoading }, fetchTotal] = useAxios(
    "/api/inventory/total-god-stone",
    { manual: true }
  );

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchData();
    fetchTotal();
  }, [isLoggedIn, fetchData, fetchTotal]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const pageLoading = loading || totalLoading;

  if (pageLoading) {
    return <FullPageLoading />;
  }

  return (
    <Grid container direction="column" spacing={3}>
      <Grid>
        <GodStoneHint totalData={totalData} />
      </Grid>
      <Grid container spacing={2}>
        {data.map((char, index) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={index}>
            <CharacterCard
              name={char.name}
              image={char.image}
              price={char.price}
              to={`/scratch-card/${char.id}`}
            />
          </Grid>
        ))}
      </Grid>
    </Grid>
  );
}

function GodStoneHint({ totalData }) {
  return (
    <Alert severity="info">
      <AlertTitle>提示</AlertTitle>
      您的女神石目前還有
      <strong>{` ${get(totalData, "total", "-")} `}</strong>個
    </Alert>
  );
}

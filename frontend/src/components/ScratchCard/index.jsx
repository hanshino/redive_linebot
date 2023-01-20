import React, { useEffect } from "react";
import useAxios from "axios-hooks";
import AlertLogin from "../AlertLogin";
import { DotsLoading } from "../Loading";
import { Grid } from "@material-ui/core";
import { Alert, AlertTitle } from "@material-ui/lab";
import { get } from "lodash";
import PropTypes from "prop-types";
import CharacterCard from "./CharacterCard";
const { liff } = window;

const ScratchCard = () => {
  const isLoggedIn = liff.isLoggedIn();
  const [{ data = [], loading }, fetchData] = useAxios("/api/ScratchCard", {
    manual: true,
  });
  const [{ data: totalData = 0, loading: totalLoading }, fetchTotal] = useAxios(
    "/api/Inventory/TotalGodStone",
    {
      manual: true,
    }
  );

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchData();
    fetchTotal();
  }, [isLoggedIn, fetchData, fetchTotal]);

  const pageLoading = loading || totalLoading;

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  if (pageLoading) {
    return <DotsLoading />;
  }

  return (
    <Grid container direction="column" spacing={3}>
      <Grid item>
        <GodStoneHint totalData={totalData} />
      </Grid>
      <Grid item container spacing={2}>
        {data.map((char, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <CharacterCard {...char} />
          </Grid>
        ))}
      </Grid>
    </Grid>
  );
};

const GodStoneHint = ({ totalData }) => {
  return (
    <Alert severity="info">
      <AlertTitle>提示</AlertTitle>
      您的女神石目前還有
      <strong>{` ${get(totalData, "total", "-")} `}</strong>個
    </Alert>
  );
};

GodStoneHint.propTypes = {
  totalData: PropTypes.object,
};

export default ScratchCard;

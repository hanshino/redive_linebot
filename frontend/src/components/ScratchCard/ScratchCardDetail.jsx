import {
  Badge as MuiBadge,
  Button,
  Grid,
  makeStyles,
  Typography,
  useTheme,
  withStyles,
} from "@material-ui/core";
import { Alert } from "@material-ui/lab";
import { DataGrid } from "@mui/x-data-grid";
import useAxios from "axios-hooks";
import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import AlertLogin from "../AlertLogin";
import { DotsLoading } from "../Loading";
import { sampleSize, chunk } from "lodash";
import { blue } from "@mui/material/colors";
import { useMemo } from "react";

const { liff } = window;

const columns = [
  { field: "reward", headerName: "獎金", width: 130 },
  { field: "sold", headerName: "已售", width: 130 },
  { field: "count", headerName: "數量", width: 130 },
];

const Badge = withStyles(theme => ({
  badge: {
    backgroundColor: blue[500],
    width: theme.spacing(2),
    height: theme.spacing(2),
    borderRadius: "50%",
  },
}))(MuiBadge);

const useStyles = makeStyles(theme => ({
  root: {
    "& > *": {
      marginTop: theme.spacing(1),
      marginBottom: theme.spacing(1),
    },
  },
}));

const ScratchCardDetail = () => {
  const isLoggedIn = liff.isLoggedIn();
  const classes = useStyles();
  const theme = useTheme();
  const { id } = useParams();
  const [{ data: card, loading }, fetchCard] = useAxios(`/api/ScratchCard/${id}`, {
    manual: true,
  });
  const [{ data: characters, loading: charactersLoading }, fetchCharacters] = useAxios(
    "/api/Princess/Character/Images",
    {
      manual: true,
    }
  );
  const [regenerate, setRegenerate] = React.useState(1);
  const randomCharacter = useMemo(() => sampleSize(characters, 10), [characters, regenerate]);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchCard();
    fetchCharacters();
  }, [isLoggedIn, fetchCard, fetchCharacters]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const pageLoading = loading || !card || charactersLoading || !characters;

  if (pageLoading) {
    return <DotsLoading />;
  }

  const pieces = chunk(randomCharacter, 5);

  const handleRegenerate = () => {
    setRegenerate(regenerate + 1);
  };

  return (
    <Grid container direction="column" className={classes.root}>
      <Grid item>
        <Typography variant="h4">{card.name}</Typography>
      </Grid>
      <Grid item xs={12} sm={6}>
        <img alt={card.name} src={card.image} style={{ maxWidth: "100%" }} />
      </Grid>
      <Grid item>
        <Alert severity="info">
          以下有 10 個角色頭像，會對應到 10 張刮刮卡，
          請隨意選擇喜歡的角色頭像，或是可以按下『重新產生』來重新產生角色頭像。
        </Alert>
      </Grid>
      {pieces.map((piece, idx) => (
        <Grid container item spacing={2} justifyContent="space-between">
          {piece.map((char, index) => (
            <Grid item xs={2} key={index} alignItems="center">
              <Badge variant="dot">
                <img alt={char.unitName} src={char.headImage} style={{ maxWidth: "100%" }} />
              </Badge>
            </Grid>
          ))}
        </Grid>
      ))}
      <Grid container item spacing={1}>
        <Grid item xs={6}>
          <Button variant="contained" fullWidth color="primary" onClick={handleRegenerate}>
            重新產生
          </Button>
        </Grid>
        <Grid item xs={6}>
          <Button variant="contained" fullWidth color="primary">
            購買
          </Button>
        </Grid>
      </Grid>
      <Grid item style={{ marginTop: theme.spacing(1) }}>
        <Typography variant="h6">目前庫存：</Typography>
      </Grid>
      <Grid container item component={"div"} style={{ height: 400, width: "100%" }}>
        <DataGrid
          rows={card.info}
          columns={columns}
          getRowId={row => row.reward}
          hideFooter
          hideFooterPagination
          hideFooterSelectedRowCount
          disableColumnFilter
          disableColumnMenu
          disableColumnSelector
          disableDensitySelector
        />
      </Grid>
    </Grid>
  );
};

export default ScratchCardDetail;

import {
  Avatar,
  Badge as MuiBadge,
  Button,
  Grid,
  IconButton,
  makeStyles,
  Typography,
  useTheme,
  withStyles,
} from "@material-ui/core";
import { Alert } from "@material-ui/lab";
import { DataGrid } from "@mui/x-data-grid";
import useAxios from "axios-hooks";
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AlertLogin from "../AlertLogin";
import { DotsLoading } from "../Loading";
import { sampleSize, chunk, get } from "lodash";
import { blue } from "@mui/material/colors";
import { useMemo } from "react";
import HintSnackBar, { useHintBar } from "../HintSnackBar";

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
  avatar: {
    [theme.breakpoints.down("sm")]: {
      width: theme.spacing(5),
      height: theme.spacing(5),
    },
    [theme.breakpoints.up("sm")]: {
      width: theme.spacing(8),
      height: theme.spacing(8),
    },
    [theme.breakpoints.up("md")]: {
      width: theme.spacing(10),
      height: theme.spacing(10),
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
  const [{ data: purchaseResult, loading: purchaseLoading, error }, doPurchase] = useAxios(
    {
      url: `/api/ScratchCard/${id}/Purchase`,
      method: "POST",
    },
    { manual: true }
  );
  const [chooseList, setChooseList] = useState([]);
  const [regenerate, setRegenerate] = React.useState(1);
  const randomCharacter = useMemo(() => sampleSize(characters, 10), [characters, regenerate]);
  const [{ open, message, severity }, { handleOpen, handleClose }] = useHintBar();

  useEffect(() => {
    window.document.title = "刮刮卡購買頁面";
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchCard();
    fetchCharacters();
  }, [isLoggedIn, fetchCard, fetchCharacters]);

  useEffect(() => {
    if (purchaseResult) {
      handleOpen("購買成功，可以至兌換區進行兌換", "success");
      fetchCard();
    }

    if (error) {
      handleOpen(get(error, "response.data.message"), "error");
    }
  }, [purchaseResult, error]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const pageLoading = loading || !card || charactersLoading || !characters || purchaseLoading;

  if (pageLoading) {
    return <DotsLoading />;
  }

  const pieces = chunk(randomCharacter, 5);

  const handleRegenerate = () => {
    setRegenerate(regenerate + 1);
    setChooseList([]);
  };

  const handleSubmit = async () => {
    if (chooseList.length <= 0) {
      handleOpen("請至少選擇一個角色頭像", "warning");
      return;
    }

    try {
      await doPurchase({
        data: {
          count: chooseList.length,
          options: chooseList,
        },
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <Grid container direction="column" className={classes.root}>
        <Grid item>
          <Typography variant="h4">{card.name}</Typography>
        </Grid>
        <Grid item xs={12} sm={12} md={8}>
          <img alt={card.name} src={card.image} style={{ maxWidth: "100%" }} />
        </Grid>
        <Grid item md={8}>
          <Alert severity="info">
            以下有 10 個角色頭像，會對應到 10 張刮刮卡，
            請隨意選擇喜歡的角色頭像，或是可以按下『重新產生』來重新產生角色頭像。
          </Alert>
        </Grid>
        {pieces.map((piece, idx) => (
          <Grid container item justifyContent="space-between" key={idx} md={8}>
            {piece.map((char, index) => {
              const isSelected = chooseList.includes(char.unitId);
              const onClick = () => {
                if (isSelected) {
                  setChooseList(chooseList.filter(x => x !== char.unitId));
                } else {
                  setChooseList([...chooseList, char.unitId]);
                }
              };
              return (
                <Grid item xs={2} key={index} style={{ textAlign: "center" }}>
                  <Badge variant="dot" invisible={!isSelected} overlap="rectangular">
                    <IconButton onClick={onClick} style={{ padding: "0px" }}>
                      <Avatar alt={char.unitName} src={char.headImage} className={classes.avatar} />
                    </IconButton>
                  </Badge>
                </Grid>
              );
            })}
          </Grid>
        ))}
        <Grid container item spacing={1} md={8}>
          <Grid item xs={6}>
            <Button variant="contained" fullWidth color="primary" onClick={handleRegenerate}>
              重新產生
            </Button>
          </Grid>
          <Grid item xs={6}>
            <Button variant="contained" fullWidth color="primary" onClick={handleSubmit}>
              購買
            </Button>
          </Grid>
        </Grid>
        <Grid item style={{ marginTop: theme.spacing(1) }} md={8}>
          <Typography variant="h6">目前庫存：</Typography>
        </Grid>
        <Grid container item md={8}>
          <div style={{ height: 400, width: "100%" }}>
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
          </div>
        </Grid>
        <Grid item md={8}>
          <Alert severity="info">投資一定有風險，基金投資有賺有賠，申購前應詳閱公開說明書。</Alert>
        </Grid>
      </Grid>
      <HintSnackBar open={open} message={message} severity={severity} handleClose={handleClose} />
    </>
  );
};

export default ScratchCardDetail;

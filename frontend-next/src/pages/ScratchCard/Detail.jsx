import { useEffect, useState, useMemo } from "react";
import useAxios from "axios-hooks";
import {
  Avatar,
  Badge,
  Button,
  Grid,
  IconButton,
  Typography,
  Alert,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { blue } from "@mui/material/colors";
import { sampleSize, chunk, get } from "lodash";
import { useParams } from "react-router-dom";
import AlertLogin from "../../components/AlertLogin";
import { FullPageLoading } from "../../components/Loading";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import { isLiffLoggedIn } from "../../utils/liff";

const columns = [
  { field: "reward", headerName: "獎金", width: 130 },
  { field: "sold", headerName: "已售", width: 130 },
  { field: "count", headerName: "數量", width: 130 },
];

export default function ScratchCardDetail() {
  const isLoggedIn = isLiffLoggedIn();
  const { id } = useParams();
  const [{ data: card, loading }, fetchCard] = useAxios(`/api/ScratchCard/${id}`, {
    manual: true,
  });
  const [{ data: characters, loading: charactersLoading }, fetchCharacters] = useAxios(
    "/api/Princess/Character/Images",
    { manual: true }
  );
  const [{ data: purchaseResult, loading: purchaseLoading, error }, doPurchase] = useAxios(
    { url: `/api/ScratchCard/${id}/Purchase`, method: "POST" },
    { manual: true }
  );
  const [chooseList, setChooseList] = useState([]);
  const [regenerate, setRegenerate] = useState(1);
  const randomCharacter = useMemo(
    () => sampleSize(characters, 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characters, regenerate]
  );
  const [{ open, message, severity }, { handleOpen, handleClose }] = useHintBar();

  useEffect(() => {
    document.title = "刮刮卡購買頁面";
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
      handleOpen(get(error, "response.data.message", "購買失敗"), "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseResult, error]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const pageLoading = loading || !card || charactersLoading || !characters || purchaseLoading;

  if (pageLoading) {
    return <FullPageLoading />;
  }

  const pieces = chunk(randomCharacter, 5);

  const handleRegenerate = () => {
    setRegenerate((prev) => prev + 1);
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
      <Grid container direction="column" sx={{ "& > *": { my: 1 } }}>
        <Grid>
          <Typography variant="h4">{card.name}</Typography>
        </Grid>
        <Grid size={{ xs: 12, md: 8 }}>
          <img alt={card.name} src={card.image} style={{ maxWidth: "100%" }} />
        </Grid>
        <Grid size={{ md: 8 }}>
          <Alert severity="info">
            以下有 10 個角色頭像，會對應到 10 張刮刮卡，
            請隨意選擇喜歡的角色頭像，或是可以按下『重新產生』來重新產生角色頭像。
          </Alert>
        </Grid>
        {pieces.map((piece, idx) => (
          <Grid container justifyContent="space-between" key={idx} size={{ md: 8 }}>
            {piece.map((char, index) => {
              const isSelected = chooseList.includes(char.unitId);
              const onClick = () => {
                if (isSelected) {
                  setChooseList(chooseList.filter((x) => x !== char.unitId));
                } else {
                  setChooseList([...chooseList, char.unitId]);
                }
              };
              return (
                <Grid size={{ xs: 2 }} key={index} sx={{ textAlign: "center" }}>
                  <Badge
                    variant="dot"
                    invisible={!isSelected}
                    overlap="rectangular"
                    sx={{
                      "& .MuiBadge-badge": {
                        bgcolor: blue[500],
                        width: (t) => t.spacing(2),
                        height: (t) => t.spacing(2),
                        borderRadius: "50%",
                      },
                    }}
                  >
                    <IconButton onClick={onClick} sx={{ p: 0 }}>
                      <Avatar
                        alt={char.unitName}
                        src={char.headImage}
                        sx={(theme) => ({
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
                        })}
                      />
                    </IconButton>
                  </Badge>
                </Grid>
              );
            })}
          </Grid>
        ))}
        <Grid container spacing={1} size={{ md: 8 }}>
          <Grid size={{ xs: 6 }}>
            <Button variant="contained" fullWidth color="primary" onClick={handleRegenerate}>
              重新產生
            </Button>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <Button variant="contained" fullWidth color="primary" onClick={handleSubmit}>
              購買
            </Button>
          </Grid>
        </Grid>
        <Grid sx={{ mt: 1 }} size={{ md: 8 }}>
          <Typography variant="h6">目前庫存：</Typography>
        </Grid>
        <Grid container size={{ md: 8 }}>
          <div style={{ height: 400, width: "100%" }}>
            <DataGrid
              rows={card.info}
              columns={columns}
              getRowId={(row) => row.reward}
              hideFooter
              disableColumnFilter
              disableColumnMenu
              disableColumnSelector
              disableDensitySelector
            />
          </div>
        </Grid>
        <Grid size={{ md: 8 }}>
          <Alert severity="info">投資一定有風險，基金投資有賺有賠，申購前應詳閱公開說明書。</Alert>
        </Grid>
      </Grid>
      <HintSnackBar open={open} message={message} severity={severity} onClose={handleClose} />
    </>
  );
}

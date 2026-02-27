import { useMemo, Fragment } from "react";
import useAxios from "axios-hooks";
import { Avatar, Grid, Typography } from "@mui/material";
import { FullPageLoading } from "../../components/Loading";
import AlertLogin from "../../components/AlertLogin";
import { isLiffLoggedIn } from "../../utils/liff";

export default function Bag() {
  const isLoggedIn = isLiffLoggedIn();
  const [{ data: items = [], loading: itemLoading }] = useAxios("/api/Inventory", {
    manual: !isLoggedIn,
  });
  const [{ data: pool = [], loading: poolLoading }] = useAxios("/api/Inventory/Pool", {
    manual: !isLoggedIn,
  });

  const unobtainedItems = useMemo(() => {
    const obtainedItemIds = items.map((item) => item.itemId);
    return pool.filter((item) => !obtainedItemIds.includes(item.itemId));
  }, [items, pool]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const pageLoading = itemLoading || poolLoading;

  const sections = [
    { title: "已取得", items },
    { title: "未取得", items: unobtainedItems },
  ];

  return (
    <>
      {pageLoading && <FullPageLoading />}
      {sections.map(({ title, items: sectionItems }) => (
        <Fragment key={title}>
          <Grid container alignItems="baseline" spacing={1}>
            <Grid size="auto">
              <Typography variant="h6">{title}</Typography>
            </Grid>
            <Grid size="auto">
              <Typography variant="body1" component="span">
                {` - ${sectionItems.length}`}
              </Typography>
            </Grid>
          </Grid>
          <ItemList items={sectionItems} />
        </Fragment>
      ))}
    </>
  );
}

function ItemList({ items }) {
  return (
    <Grid container justifyContent="space-around">
      {items.map((item) => (
        <Grid
          key={item.itemId}
          size={{ xs: 2, sm: 1, lg: 1 }}
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            m: 1,
          }}
        >
          <Avatar
            variant="rounded"
            src={item.headImage}
            alt={item.name}
            sx={(theme) => ({
              width: theme.spacing(14),
              height: theme.spacing(14),
              [theme.breakpoints.down("lg")]: {
                width: theme.spacing(12),
                height: theme.spacing(12),
              },
              [theme.breakpoints.down("md")]: {
                width: theme.spacing(10),
                height: theme.spacing(10),
              },
            })}
          />
          <Typography
            align="center"
            sx={(theme) => ({
              [theme.breakpoints.down("lg")]: {
                ...theme.typography.subtitle1,
              },
              [theme.breakpoints.down("md")]: {
                ...theme.typography.caption,
              },
            })}
          >
            {item.name}
          </Typography>
        </Grid>
      ))}
    </Grid>
  );
}

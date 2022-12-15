import React, { useMemo, Fragment } from "react";
import useAxios from "axios-hooks";
import { Avatar, Grid, makeStyles, Typography } from "@material-ui/core";
import { CirclesLoading } from "../Loading";
import PropTypes from "prop-types";
import AlertLogin from "../AlertLogin";

const useStyles = makeStyles(theme => ({
  item: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    margin: theme.spacing(1),
  },
  avatar: {
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
  },
  unitName: {
    [theme.breakpoints.down("lg")]: {
      ...theme.typography.subtitle1,
    },
    [theme.breakpoints.down("md")]: {
      ...theme.typography.caption,
    },
    [theme.breakpoints.down("sm")]: {
      ...theme.typography.caption,
    },
  },
}));

const Bag = () => {
  const { liff } = window;
  const isLoggedIn = liff.isLoggedIn();
  const [{ data: items = [], itemLoading }] = useAxios("/api/Inventory", { manual: !isLoggedIn });
  const [{ data: pool = [], poolLoading }] = useAxios("/api/Inventory/Pool", {
    manual: !isLoggedIn,
  });
  const unobtainedItems = useMemo(() => {
    const obtainedItemIds = items.map(item => item.itemId);
    return pool.filter(item => !obtainedItemIds.includes(item.itemId));
  }, [items, pool]);

  if (!isLoggedIn) {
    return <AlertLogin />;
  }

  const pageLoading = itemLoading || poolLoading;

  const data = [
    { title: "已取得", items },
    { title: "未取得", items: unobtainedItems },
  ];

  const renderItems = ({ title, items }) => (
    <Fragment key={title}>
      <Grid container alignItems="baseline" spacing={1}>
        <Grid item>
          <Typography variant="h6">{title}</Typography>
        </Grid>
        <Grid item>
          <Typography variant="body1" component="span">
            {` - ${items.length}`}
          </Typography>
        </Grid>
      </Grid>
      <ItemList items={items} />
    </Fragment>
  );

  return (
    <>
      {pageLoading && <CirclesLoading />}
      {data.map(renderItems)}
    </>
  );
};

const ItemList = ({ items }) => {
  const classes = useStyles();
  return (
    <Grid container justifyContent="space-around">
      {items.map(item => (
        <Grid item key={item.itemId} className={classes.item} xs={2} sm={1} lg={1}>
          <Avatar
            variant="rounded"
            src={item.headImage}
            alt={item.name}
            className={classes.avatar}
          />
          <Typography align="center" className={classes.unitName}>
            {item.name}
          </Typography>
        </Grid>
      ))}
    </Grid>
  );
};

ItemList.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      itemId: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      headImage: PropTypes.string.isRequired,
    })
  ).isRequired,
};

export default Bag;

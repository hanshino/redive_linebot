import React, { useEffect, Fragment, useState } from "react";
import { Switch, Route, Link, useLocation, useRouteMatch } from "react-router-dom";
import SigninTable from "./SigninTable";
import ConfigPage from "./ConfigPage";
import { makeStyles } from "@material-ui/core/styles";
import AppBar from "@material-ui/core/AppBar";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";

function a11yProps(index) {
  return {
    id: `full-width-tab-${index}`,
    "aria-controls": `full-width-tabpanel-${index}`,
  };
}

const useStyles = makeStyles(theme => ({
  root: {
    backgroundColor: theme.palette.background.paper,
  },
  header: {
    padding: theme.spacing(1),
    "& > *": {
      margin: theme.spacing(1),
    },
  },
}));

function FullWidthTabs() {
  const { url } = useRouteMatch();
  const classes = useStyles();
  const [value, setValue] = useState(0);
  const [BattleTabs, setTabs] = useState([]);
  let location = useLocation();

  useEffect(() => {
    let tabDatas = [
      { label: "戰隊簽到表", link: `${url}/SignTable` },
      { label: "戰隊設定", link: `${url}/Config` },
    ];
    setTabs(tabDatas);

    let idx = tabDatas.findIndex(data => location.pathname.indexOf(data.link) !== -1);
    if (idx !== -1) setValue(idx);
  }, [location.pathname]);

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  return (
    <div className={classes.root}>
      <AppBar position="static" color="default">
        <Tabs
          value={value}
          onChange={handleChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
          aria-label="full width tabs example"
        >
          {BattleTabs.map((tab, index) => (
            <Tab
              key={index}
              label={tab.label}
              component={Link}
              to={tab.link}
              {...a11yProps(index)}
            />
          ))}
        </Tabs>
      </AppBar>
    </div>
  );
}

const GroupBattle = () => {
  const classes = useStyles();
  useEffect(() => {
    window.document.title = "群組戰隊管理";
  }, []);

  return (
    <Fragment>
      <Grid container alignItems="flex-end" className={classes.header}>
        <Grid item>
          <Typography variant="h5">{"戰隊管理系統"}</Typography>
        </Grid>
        <Grid item>
          <Typography variant="caption" color="textSecondary">
            {"打造專屬於戰隊的環境"}
          </Typography>
        </Grid>
      </Grid>
      <FullWidthTabs />
      <Switch>
        <Route path="/Group/:groupId/Battle/SignTable" component={SigninTable} />
        <Route path="/Group/:groupId/Battle/Config" component={ConfigPage} />
      </Switch>
    </Fragment>
  );
};

export default GroupBattle;

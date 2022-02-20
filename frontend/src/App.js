import React, { useEffect, useState } from "react";
import "./App.css";
import NavBar from "./components/NavBar";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  useParams,
  useLocation,
  Redirect,
} from "react-router-dom";
import GroupRecord from "./components/GroupRecord";
import CustomerOrder from "./components/CustomerOrder";
import GroupConfig from "./components/GroupConfig";
import GachaPool from "./components/Admin/GachaPool";
import Message from "./components/Admin/Message";
import Order from "./components/Admin/Order";
import Home from "./components/Home";
import PrincessCard from "./components/PrincessCard";
import GroupBattle from "./components/GroupBattle";
import axios from "axios";
import BattleSignPanel from "./components/Panel/BattleSign";
import BattleControlPanel from "./components/Panel/BattleControl";
import ManualPanel from "./components/Panel/Manual";
import PropTypes from "prop-types";
import Notify from "./components/Bot/Notify";
import Binding from "./components/Bot/Binding";
import Rankings from "./components/Rankings";
import WorldbossMessage, {
  WorldBossMessageCreate,
  WorldBossMessageUpdate,
} from "./components/Admin/WorldbossMessage";
import { cyan, lightBlue } from "@material-ui/core/colors";
import { ThemeProvider } from "@material-ui/styles";
import { createTheme } from "@material-ui/core";
import BattleTime from "./components/Tools/BattleTime";
import GodStoneShop from "./components/GodStoneShop";
import GachaShop from "./components/Admin/GachaShop";
import { WhirlyLoading } from "./components/Loading";
import Worldboss from "./components/Admin/Worldboss";
import WorldbossEvent from "./components/Admin/WorldbossEvent";
import TradeOrder, { Transaction } from "./components/TradeOrder";

const theme = createTheme({
  palette: {
    primary: cyan,
    secondary: lightBlue,
  },
});

const useQuery = () => {
  return new URLSearchParams(useLocation().search);
};

function App() {
  axios.defaults.timeout = 5000;

  return (
    <ThemeProvider theme={theme}>
      <Router>
        <Switch>
          <Route path="/liff/:size" component={LiffSizeLayout} />
          <Route path="*" component={MainLayout} />
        </Switch>
      </Router>
    </ThemeProvider>
  );
}

const RedirectDetect = props => {
  let query = useQuery();
  let redirectUri = query.get("reactRedirectUri") || props.redirectUri;

  if (redirectUri) {
    return <Redirect to={redirectUri} />;
  }

  return <></>;
};

RedirectDetect.propTypes = {
  redirectUri: PropTypes.string,
};

function LiffSizeLayout() {
  const [loading, setLoading] = useState(true);
  const { size } = useParams();
  const { liff } = window;

  useEffect(() => {
    window.localStorage.setItem("liff_size", size);
    axios
      .get(`/api/send-id?size=${size}`)
      .then(res => res.data)
      .then(data => liff.init({ liffId: data.id }))
      .finally(() => setLoading(false));
  }, [liff, size]);

  if (loading) return <WhirlyLoading />;

  return <RedirectDetect redirectUri="/" />;
}

function MainLayout() {
  const { liff } = window;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let size = window.localStorage.getItem("liff_size") || "full";
    axios
      .get(`/api/send-id?size=${size}`)
      .then(res => res.data)
      .then(data => liff.init({ liffId: data.id }))
      .then(() => {
        if (liff.isLoggedIn()) {
          axios.defaults.headers.common["Authorization"] = `Bearer ${liff.getAccessToken()}`;
        }
      })
      .finally(() => setLoading(false));
  }, [liff]);

  if (loading) return <WhirlyLoading />;

  return (
    <NavBar>
      <RedirectDetect />
      <Switch>
        <Route path="/Princess/Profile" component={PrincessCard} />
        <Route path="/Bot" component={BotLayout} />
        <Route path="/Group" component={GroupLayout} />
        <Route path="/Admin" component={AdminLayout} />
        <Route path="/Source/:sourceId/Customer/Orders" component={CustomerOrder} />
        <Route path="/Panel" component={PanelLayout} />
        <Route path="/Rankings" component={Rankings} />
        <Route path="/Tools" component={ToolsLayout} />
        <Route path="/Trade" component={TradeLayout} />
        <Route path="/Gacha/Exchange" component={GodStoneShop} />
        <Route path="/" component={Home} />
      </Switch>
    </NavBar>
  );
}

function TradeLayout() {
  return (
    <Switch>
      <Route path="/Trade/History" />
      <Route path="/Trade/Order" component={TradeOrder} />
      <Route path="/Trade/:marketId/Transaction" component={Transaction} />
    </Switch>
  );
}

function ToolsLayout() {
  return (
    <Switch>
      <Route path="/Tools/BattleTime" component={BattleTime} />
    </Switch>
  );
}

function PanelLayout() {
  return (
    <Switch>
      <Route path="/Panel/Manual" component={ManualPanel} />
      <Route path="/Panel/Group/Battle/Control" component={BattleControlPanel} />
      <Route path="/Panel/Group/Battle/:week?/:boss?" component={BattleSignPanel} />
    </Switch>
  );
}

function BotLayout() {
  return (
    <Switch>
      <Route path="/Bot/Notify/Binding" component={Binding} />
      <Route path="/Bot/Notify" component={Notify} />
    </Switch>
  );
}

function GroupLayout() {
  return (
    <Switch>
      <Route path="/Group/:groupId/Record" component={GroupRecord} />
      <Route path="/Group/:groupId/Config" component={GroupConfig} />
      <Route path="/Group/:groupId/Battle" component={GroupBattle} />
    </Switch>
  );
}

function AdminLayout() {
  return (
    <Switch>
      <Route path="/Admin/GachaPool" component={GachaPool} />
      <Route path="/Admin/GlobalOrder" component={Order} />
      <Route path="/Admin/Messages" component={Message} />
      <Route path="/Admin/Worldboss" component={Worldboss} />
      <Route path="/Admin/WorldbossEvent" component={WorldbossEvent} />
      <Route path="/Admin/WorldbossMessage/Create" component={WorldBossMessageCreate} />
      <Route path="/Admin/WorldbossMessage/Update/:id" component={WorldBossMessageUpdate} />
      <Route path="/Admin/WorldbossMessage" component={WorldbossMessage} />
      <Route path="/Admin/GachaShop" component={GachaShop} />
    </Switch>
  );
}

export default App;

import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import LiffLayout from "./layouts/LiffLayout";

// Pages
import Home from "./pages/Home";
import Rankings from "./pages/Rankings";
import Janken from "./pages/Janken";
import Race from "./pages/Race";
import RaceBet from "./pages/Race/Bet";
import RaceDetail from "./pages/Race/Detail";
import GachaExchange from "./pages/Gacha/Exchange";
import Bag from "./pages/Bag";
import Equipment from "./pages/Equipment";
import TradeOrder from "./pages/Trade/Order";
import TradeManage from "./pages/Trade/Manage";
import TradeDetail from "./pages/Trade/Detail";
import TradeTransaction from "./pages/Trade/Transaction";
import GroupList from "./pages/Group";
import GroupRecord from "./pages/Group/Record";
import GroupConfig from "./pages/Group/Config";
import GroupBattle from "./pages/Group/Battle";
import PanelManual from "./pages/Panel/Manual";
import BattleControl from "./pages/Panel/BattleControl";
import BattleSign from "./pages/Panel/BattleSign";
import CustomerOrder from "./pages/CustomerOrder";
import Achievement from "./pages/Achievement";
import Prestige from "./pages/Prestige";
import AutoSettings from "./pages/AutoSettings";
import AutoHistory from "./pages/AutoHistory";
import AdminGachaPool from "./pages/Admin/GachaPool";
import AdminGachaPoolForm from "./pages/Admin/GachaPool/GachaPoolForm";
import AdminGachaBanner from "./pages/Admin/GachaBanner";
import AdminGachaBannerForm from "./pages/Admin/GachaBanner/GachaBannerForm";
import AdminGachaShop from "./pages/Admin/GachaShop";
import AdminGlobalOrder from "./pages/Admin/GlobalOrder";
import AdminMessages from "./pages/Admin/Messages";
import AdminWorldboss from "./pages/Admin/Worldboss";
import AdminWorldbossEvent from "./pages/Admin/WorldbossEvent";
import AdminWorldbossMessage from "./pages/Admin/WorldbossMessage";
import AdminWorldbossMessageCreate from "./pages/Admin/WorldbossMessageCreate";
import AdminWorldbossMessageUpdate from "./pages/Admin/WorldbossMessageUpdate";
import RequireAdmin from "./components/RequireAdmin";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* LIFF routes */}
        <Route path="/liff/:size/*" element={<LiffLayout />} />

        {/* Main routes */}
        <Route element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="rankings" element={<Rankings />} />
          <Route path="janken" element={<Janken />} />
          <Route path="race" element={<Race />} />
          <Route path="race/bet" element={<RaceBet />} />
          <Route path="race/:raceId" element={<RaceDetail />} />

          {/* Gacha */}
          <Route path="gacha/exchange" element={<GachaExchange />} />

          {/* Inventory */}
          <Route path="bag" element={<Bag />} />
          <Route path="equipment" element={<Equipment />} />

          {/* Trade */}
          <Route path="trade/order" element={<TradeOrder />} />
          <Route path="trade/manage" element={<TradeManage />} />
          <Route path="trade/:marketId/detail" element={<TradeDetail />} />
          <Route path="trade/:marketId/transaction" element={<TradeTransaction />} />

          {/* Group */}
          <Route path="groups" element={<GroupList />} />
          <Route path="group/:groupId/record" element={<GroupRecord />} />
          <Route path="group/:groupId/config" element={<GroupConfig />} />
          <Route path="group/:groupId/battle" element={<GroupBattle />} />

          {/* Panel */}
          <Route path="panel/manual" element={<PanelManual />} />
          <Route path="panel/group/battle/control" element={<BattleControl />} />
          <Route path="panel/group/battle/:week?/:boss?" element={<BattleSign />} />

          {/* Customer Order */}
          <Route path="source/:sourceId/customer/orders" element={<CustomerOrder />} />

          {/* Achievement */}
          <Route path="achievements" element={<Achievement />} />
          <Route path="prestige" element={<Prestige />} />

          {/* Subscriber auto-actions (LIFF) */}
          <Route path="auto/settings" element={<AutoSettings />} />
          <Route path="auto/history" element={<AutoHistory />} />

          {/* Admin — requires admin privilege */}
          <Route element={<RequireAdmin />}>
            <Route path="admin/gacha-pool" element={<AdminGachaPool />} />
            <Route path="admin/gacha-pool/new" element={<AdminGachaPoolForm />} />
            <Route path="admin/gacha-pool/:id/edit" element={<AdminGachaPoolForm />} />
            <Route path="admin/gacha-banner" element={<AdminGachaBanner />} />
            <Route path="admin/gacha-banner/new" element={<AdminGachaBannerForm />} />
            <Route path="admin/gacha-banner/:id/edit" element={<AdminGachaBannerForm />} />
            <Route path="admin/gacha-shop" element={<AdminGachaShop />} />
            <Route path="admin/global-order" element={<AdminGlobalOrder />} />
            <Route path="admin/messages" element={<AdminMessages />} />
            <Route path="admin/worldboss" element={<AdminWorldboss />} />
            <Route path="admin/worldboss-event" element={<AdminWorldbossEvent />} />
            <Route path="admin/worldboss-message" element={<AdminWorldbossMessage />} />
            <Route
              path="admin/worldboss-message/create"
              element={<AdminWorldbossMessageCreate />}
            />
            <Route
              path="admin/worldboss-message/update/:id"
              element={<AdminWorldbossMessageUpdate />}
            />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

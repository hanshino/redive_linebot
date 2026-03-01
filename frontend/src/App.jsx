import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import LiffLayout from "./layouts/LiffLayout";

// Pages
import Home from "./pages/Home";
import Rankings from "./pages/Rankings";
import GachaExchange from "./pages/Gacha/Exchange";
import ScratchCard from "./pages/ScratchCard";
import ScratchCardDetail from "./pages/ScratchCard/Detail";
import ScratchCardExchange from "./pages/ScratchCard/Exchange";
import Bag from "./pages/Bag";
import Equipment from "./pages/Equipment";
import TradeOrder from "./pages/Trade/Order";
import TradeManage from "./pages/Trade/Manage";
import TradeDetail from "./pages/Trade/Detail";
import TradeTransaction from "./pages/Trade/Transaction";
import GroupRecord from "./pages/Group/Record";
import GroupConfig from "./pages/Group/Config";
import GroupBattle from "./pages/Group/Battle";
import PanelManual from "./pages/Panel/Manual";
import BattleControl from "./pages/Panel/BattleControl";
import BattleSign from "./pages/Panel/BattleSign";
import CustomerOrder from "./pages/CustomerOrder";
import AdminGachaPool from "./pages/Admin/GachaPool";
import AdminGachaPoolForm from "./pages/Admin/GachaPool/GachaPoolForm";
import AdminGachaShop from "./pages/Admin/GachaShop";
import AdminGlobalOrder from "./pages/Admin/GlobalOrder";
import AdminMessages from "./pages/Admin/Messages";
import AdminWorldboss from "./pages/Admin/Worldboss";
import AdminWorldbossEvent from "./pages/Admin/WorldbossEvent";
import AdminWorldbossMessage from "./pages/Admin/WorldbossMessage";
import AdminWorldbossMessageCreate from "./pages/Admin/WorldbossMessageCreate";
import AdminWorldbossMessageUpdate from "./pages/Admin/WorldbossMessageUpdate";
import AdminScratchCard from "./pages/Admin/ScratchCard";
import ToolsBattleTime from "./pages/Tools/BattleTime";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* LIFF routes */}
        <Route path="/liff/:size" element={<LiffLayout />} />

        {/* Main routes */}
        <Route element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="rankings" element={<Rankings />} />

          {/* Gacha */}
          <Route path="gacha/exchange" element={<GachaExchange />} />

          {/* ScratchCard */}
          <Route path="scratch-card" element={<ScratchCard />} />
          <Route path="scratch-card/exchange" element={<ScratchCardExchange />} />
          <Route path="scratch-card/:id" element={<ScratchCardDetail />} />

          {/* Inventory */}
          <Route path="bag" element={<Bag />} />
          <Route path="equipment" element={<Equipment />} />

          {/* Trade */}
          <Route path="trade/order" element={<TradeOrder />} />
          <Route path="trade/manage" element={<TradeManage />} />
          <Route path="trade/:marketId/detail" element={<TradeDetail />} />
          <Route path="trade/:marketId/transaction" element={<TradeTransaction />} />

          {/* Group */}
          <Route path="group/:groupId/record" element={<GroupRecord />} />
          <Route path="group/:groupId/config" element={<GroupConfig />} />
          <Route path="group/:groupId/battle" element={<GroupBattle />} />

          {/* Panel */}
          <Route path="panel/manual" element={<PanelManual />} />
          <Route path="panel/group/battle/control" element={<BattleControl />} />
          <Route path="panel/group/battle/:week?/:boss?" element={<BattleSign />} />

          {/* Customer Order */}
          <Route path="source/:sourceId/customer/orders" element={<CustomerOrder />} />

          {/* Admin */}
          <Route path="admin/gacha-pool" element={<AdminGachaPool />} />
          <Route path="admin/gacha-pool/new" element={<AdminGachaPoolForm />} />
          <Route path="admin/gacha-pool/:id/edit" element={<AdminGachaPoolForm />} />
          <Route path="admin/gacha-shop" element={<AdminGachaShop />} />
          <Route path="admin/global-order" element={<AdminGlobalOrder />} />
          <Route path="admin/messages" element={<AdminMessages />} />
          <Route path="admin/worldboss" element={<AdminWorldboss />} />
          <Route path="admin/worldboss-event" element={<AdminWorldbossEvent />} />
          <Route path="admin/worldboss-message" element={<AdminWorldbossMessage />} />
          <Route path="admin/worldboss-message/create" element={<AdminWorldbossMessageCreate />} />
          <Route path="admin/worldboss-message/update/:id" element={<AdminWorldbossMessageUpdate />} />
          <Route path="admin/scratch-card" element={<AdminScratchCard />} />

          {/* Tools */}
          <Route path="tools/battle-time" element={<ToolsBattleTime />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

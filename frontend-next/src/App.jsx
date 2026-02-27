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
import BotNotify from "./pages/Bot/Notify";
import BotBinding from "./pages/Bot/Binding";
import GroupRecord from "./pages/Group/Record";
import GroupConfig from "./pages/Group/Config";
import GroupBattle from "./pages/Group/Battle";
import PanelManual from "./pages/Panel/Manual";
import BattleControl from "./pages/Panel/BattleControl";
import BattleSign from "./pages/Panel/BattleSign";
import CustomerOrder from "./pages/CustomerOrder";
import AdminGachaPool from "./pages/Admin/GachaPool";
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
          <Route path="Rankings" element={<Rankings />} />

          {/* Gacha */}
          <Route path="Gacha/Exchange" element={<GachaExchange />} />

          {/* ScratchCard */}
          <Route path="ScratchCard" element={<ScratchCard />} />
          <Route path="ScratchCard/Exchange" element={<ScratchCardExchange />} />
          <Route path="ScratchCard/:id" element={<ScratchCardDetail />} />

          {/* Inventory */}
          <Route path="Bag" element={<Bag />} />
          <Route path="Equipment" element={<Equipment />} />

          {/* Trade */}
          <Route path="Trade/Order" element={<TradeOrder />} />
          <Route path="Trade/Manage" element={<TradeManage />} />
          <Route path="Trade/:marketId/Detail" element={<TradeDetail />} />
          <Route path="Trade/:marketId/Transaction" element={<TradeTransaction />} />

          {/* Bot */}
          <Route path="Bot/Notify" element={<BotNotify />} />
          <Route path="Bot/Notify/Binding" element={<BotBinding />} />

          {/* Group */}
          <Route path="Group/:groupId/Record" element={<GroupRecord />} />
          <Route path="Group/:groupId/Config" element={<GroupConfig />} />
          <Route path="Group/:groupId/Battle" element={<GroupBattle />} />

          {/* Panel */}
          <Route path="Panel/Manual" element={<PanelManual />} />
          <Route path="Panel/Group/Battle/Control" element={<BattleControl />} />
          <Route path="Panel/Group/Battle/:week?/:boss?" element={<BattleSign />} />

          {/* Customer Order */}
          <Route path="Source/:sourceId/Customer/Orders" element={<CustomerOrder />} />

          {/* Admin */}
          <Route path="Admin/GachaPool" element={<AdminGachaPool />} />
          <Route path="Admin/GachaShop" element={<AdminGachaShop />} />
          <Route path="Admin/GlobalOrder" element={<AdminGlobalOrder />} />
          <Route path="Admin/Messages" element={<AdminMessages />} />
          <Route path="Admin/Worldboss" element={<AdminWorldboss />} />
          <Route path="Admin/WorldbossEvent" element={<AdminWorldbossEvent />} />
          <Route path="Admin/WorldbossMessage" element={<AdminWorldbossMessage />} />
          <Route path="Admin/WorldbossMessage/Create" element={<AdminWorldbossMessageCreate />} />
          <Route
            path="Admin/WorldbossMessage/Update/:id"
            element={<AdminWorldbossMessageUpdate />}
          />
          <Route path="Admin/ScratchCard" element={<AdminScratchCard />} />

          {/* Tools */}
          <Route path="Tools/BattleTime" element={<ToolsBattleTime />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

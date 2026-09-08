import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
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
import GachaFragments from "./pages/Gacha/Fragments";
import Bag from "./pages/Bag";
import Equipment from "./pages/Equipment";
import TradeOrder from "./pages/Trade/Order";
import TradeManage from "./pages/Trade/Manage";
import TradeDetail from "./pages/Trade/TradeDetail";
import Market from "./pages/Trade/Market";
import MarketListing from "./pages/Trade/MarketListing";
import MarketSell from "./pages/Trade/Sell";
import MarketBuy from "./pages/Trade/Buy";
import MyListings from "./pages/Trade/MyListings";
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
import XpHistory from "./pages/XpHistory";
import XpHistoryAbout from "./pages/XpHistory/About";
import AutoSettings from "./pages/AutoSettings";
import AutoHistory from "./pages/AutoHistory";
import Topics from "./pages/Topics";
import Signin from "./pages/Signin";
import AdminGachaPool from "./pages/Admin/GachaPool";
import AdminGachaPoolForm from "./pages/Admin/GachaPool/GachaPoolForm";
import AdminGachaBanner from "./pages/Admin/GachaBanner";
import AdminGachaBannerForm from "./pages/Admin/GachaBanner/GachaBannerForm";
import AdminGachaShop from "./pages/Admin/GachaShop";
import AdminGlobalOrder from "./pages/Admin/GlobalOrder";
import AdminMessages from "./pages/Admin/Messages";
import AdminCoupons from "./pages/Admin/Coupon";
import AdminWorldboss from "./pages/Admin/Worldboss";
import Worldboss from "./pages/Worldboss";
import RequireAdmin from "./components/RequireAdmin";

function RedirectFromTransaction() {
  const { marketId } = useParams();
  return <Navigate to={`/trade/${marketId}`} replace />;
}

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
          <Route path="worldboss" element={<Worldboss />} />
          <Route path="race" element={<Race />} />
          <Route path="race/bet" element={<RaceBet />} />
          <Route path="race/:raceId" element={<RaceDetail />} />

          {/* Gacha */}
          <Route path="gacha/exchange" element={<GachaExchange />} />
          <Route path="gacha/fragments" element={<GachaFragments />} />

          {/* Inventory */}
          <Route path="bag" element={<Bag />} />
          <Route path="equipment" element={<Equipment />} />

          {/* Trade */}
          {/* 公開市場 / 角色委託所 —— 必須排在 trade/:marketId 之前，
              否則 "market" / "sell" / "buy" / "my-listings" 會被當成 marketId 吃掉。 */}
          <Route path="trade/market" element={<Market />} />
          <Route path="trade/sell" element={<MarketSell />} />
          <Route path="trade/buy" element={<MarketBuy />} />
          <Route path="trade/my-listings" element={<MyListings />} />
          <Route path="trade/listings/:id" element={<MarketListing />} />
          <Route path="trade/order" element={<TradeOrder />} />
          <Route path="trade/manage" element={<TradeManage />} />
          <Route path="trade/:marketId" element={<TradeDetail />} />
          <Route path="trade/:marketId/detail" element={<TradeDetail />} />
          <Route path="trade/:marketId/transaction" element={<RedirectFromTransaction />} />

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
          <Route path="xp-history" element={<XpHistory />} />
          <Route path="xp-history/about" element={<XpHistoryAbout />} />

          {/* Subscriber auto-actions (LIFF) */}
          <Route path="auto/settings" element={<AutoSettings />} />
          <Route path="auto/history" element={<AutoHistory />} />

          {/* Chat word-cloud (LIFF) — must match getLiffUri("full", "/topics") */}
          <Route path="topics" element={<Topics />} />

          {/* Daily sign-in calendar (LIFF) — matches /liff/full/signin */}
          <Route path="signin" element={<Signin />} />

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
            <Route path="admin/coupons" element={<AdminCoupons />} />
            <Route path="admin/worldboss" element={<AdminWorldboss />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

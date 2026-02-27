import { useState, useEffect } from "react";
import { Box, Typography, Tabs, Tab } from "@mui/material";
import SigninTable from "../../components/GroupBattle/SigninTable";
import BattleConfig from "../../components/GroupBattle/BattleConfig";

function a11yProps(index) {
  return {
    id: `battle-tab-${index}`,
    "aria-controls": `battle-tabpanel-${index}`,
  };
}

function TabPanel({ children, value, index }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`battle-tabpanel-${index}`}
      aria-labelledby={`battle-tab-${index}`}
    >
      {value === index && <Box>{children}</Box>}
    </div>
  );
}

export default function GroupBattle() {
  const [tab, setTab] = useState(0);

  useEffect(() => {
    document.title = "群組戰隊管理";
  }, []);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, p: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          戰隊管理系統
        </Typography>
        <Typography variant="caption" color="text.secondary">
          打造專屬於戰隊的環境
        </Typography>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        indicatorColor="primary"
        textColor="primary"
        variant="fullWidth"
        aria-label="battle tabs"
      >
        <Tab label="戰隊簽到表" {...a11yProps(0)} />
        <Tab label="戰隊設定" {...a11yProps(1)} />
      </Tabs>

      <TabPanel value={tab} index={0}>
        <SigninTable />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <BattleConfig />
      </TabPanel>
    </Box>
  );
}

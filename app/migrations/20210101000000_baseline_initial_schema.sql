-- AUTO-GENERATED from migration/Princess.sql (schema only, NO data).
-- 由 baseline migration 讀取執行；勿手改。資料種子交給 app/seeds/*。

CREATE TABLE IF NOT EXISTS `Admin` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `privilege` varchar(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `arena_like_records` (
  `merge_hash` varchar(255) NOT NULL,
  `attack_hash` varchar(255) NOT NULL,
  `defense_hash` varchar(255) NOT NULL,
  `userId` varchar(255) NOT NULL,
  `type` varchar(1) NOT NULL COMMENT '1:like,2:unlike',
  `update_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '異動時間',
  `is_upload_image` varchar(1) NOT NULL DEFAULT '0' COMMENT '1:有上傳佐證、0:無上傳純按鈕',
  PRIMARY KEY (`attack_hash`,`defense_hash`,`userId`),
  KEY `IDX_MERGE_HASH` (`merge_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `arena_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `left_hash` varchar(255) NOT NULL,
  `right_hash` varchar(255) NOT NULL,
  `left_team` json NOT NULL COMMENT '左圖隊伍（自己）',
  `right_team` json NOT NULL COMMENT '右圖隊伍（對方）',
  `left_result` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '左圖勝負，1:勝利、0:失敗',
  `right_result` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '右圖勝負，1:勝利、0:失敗',
  `left_type` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '左圖類型，1:進攻、2:防守',
  `right_type` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '右圖類型，1:進攻、2:防守',
  `author_id` varchar(255) NOT NULL COMMENT '紀錄作者id',
  `source_id` varchar(255) NOT NULL COMMENT '紀錄來源id，作為是否分享的依據',
  `is_share` varchar(1) NOT NULL COMMENT '1:分享、0:自用',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `left_hash` (`left_hash`),
  KEY `right_hash` (`right_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='紀錄競技場勝負';

CREATE TABLE IF NOT EXISTS `BulletIn` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `sort` varchar(255) NOT NULL,
  `p` text NOT NULL,
  `date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `url` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公主公告儲存';

CREATE TABLE IF NOT EXISTS `chat_exp_unit` (
  `unit_level` int NOT NULL,
  `total_exp` int NOT NULL,
  PRIMARY KEY (`unit_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天經驗單位';

CREATE TABLE IF NOT EXISTS `chat_level_title` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `title_range` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天等級稱號';

CREATE TABLE IF NOT EXISTS `chat_range_title` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='級距頭銜前贅';

CREATE TABLE IF NOT EXISTS `chat_user_data` (
  `id` int NOT NULL,
  `experience` int NOT NULL DEFAULT '1',
  `modify_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `rank` int NOT NULL DEFAULT '99999',
  UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天制度用戶經驗';

CREATE TABLE IF NOT EXISTS `CustomerOrder` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `No` int NOT NULL,
  `SourceId` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `OrderKey` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `CusOrder` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Status` int DEFAULT '1',
  `TouchType` varchar(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `MessageType` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Reply` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `CreateDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `CreateUser` varchar(33) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ModifyDTM` datetime DEFAULT NULL,
  `ModifyUser` varchar(33) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `SenderName` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `SenderIcon` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `TouchDTM` datetime DEFAULT NULL,
  PRIMARY KEY (`ID`),
  KEY `IDX_CustOrderSource` (`SourceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GachaPool` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `Name` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `HeadImage_Url` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Star` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Rate` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Is_Princess` varchar(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '0',
  `Modify_TS` datetime DEFAULT CURRENT_TIMESTAMP,
  `Tag` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GachaSignin` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `signinDate` datetime NOT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GlobalOrders` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `No` int NOT NULL,
  `Key` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `KeyWord` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Status` int NOT NULL DEFAULT '1',
  `TouchType` varchar(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `MessageType` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Reply` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ModifyTS` datetime DEFAULT CURRENT_TIMESTAMP,
  `SenderName` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `SenderIcon` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Guild` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `GuildId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Status` int NOT NULL DEFAULT '1',
  `CreateDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `CloseDTM` datetime DEFAULT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GuildBattleConfig` (
  `GuildId` varchar(45) NOT NULL,
  `NotifyToken` varchar(255) NOT NULL,
  `SignMessage` varchar(255) NOT NULL,
  `modify_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`GuildId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='紀錄戰隊系統設定';

CREATE TABLE IF NOT EXISTS `GuildBattleFinish` (
  `id` int NOT NULL AUTO_INCREMENT,
  `GuildId` varchar(45) NOT NULL COMMENT '群組編號',
  `UserId` varchar(45) NOT NULL COMMENT '用戶編號',
  `CreateDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '新增日期',
  PRIMARY KEY (`id`),
  KEY `idxUserId` (`UserId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GuildConfig` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `GuildId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Config` json NOT NULL,
  `modifyDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `DiscordWebhook` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `WelcomeMessage` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `SenderName` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `SenderIcon` mediumtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`ID`),
  UNIQUE KEY `GuildId_UNIQUE` (`GuildId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `GuildMembers` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `GuildId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `UserId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Status` int NOT NULL DEFAULT '1',
  `JoinedDTM` datetime DEFAULT CURRENT_TIMESTAMP,
  `LeftDTM` datetime DEFAULT NULL,
  `SpeakTimes` int DEFAULT '0',
  `LastSpeakDTM` datetime DEFAULT NULL,
  PRIMARY KEY (`ID`),
  UNIQUE KEY `GM_Unique` (`GuildId`,`UserId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Inventory` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemId` int NOT NULL,
  `itemAmount` int NOT NULL DEFAULT '1',
  `createDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `MessageRecord` (
  `ID` int NOT NULL,
  `MR_TEXT` int DEFAULT '0' COMMENT '文字訊息次數',
  `MR_IMAGE` int DEFAULT '0' COMMENT '圖片訊息次數',
  `MR_STICKER` int DEFAULT '0' COMMENT '貼圖次數記錄',
  `MR_VIDEO` int DEFAULT '0' COMMENT '影片訊息次數',
  `MR_UNSEND` int DEFAULT '0' COMMENT '訊息收回次數',
  `MR_MODIFYDTM` datetime DEFAULT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='訊息數據紀錄';

CREATE TABLE IF NOT EXISTS `notify_list` (
  `id` int NOT NULL COMMENT '跟User編號一樣',
  `type` varchar(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '類型，1:Line Notify、2:Discord Webhook',
  `token` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '根據type儲存不同token',
  `sub_type` int NOT NULL DEFAULT '0',
  `status` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1' COMMENT '1:開啟、0:關閉',
  `modify_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '修改時間',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='訂閱系統token紀錄';

CREATE TABLE IF NOT EXISTS `PrincessUID` (
  `userId` varchar(45) NOT NULL COMMENT 'Line使用者ID',
  `uid` varchar(10) NOT NULL COMMENT '公主連結ID',
  `server` int NOT NULL COMMENT '遊戲伺服器，1:美食殿堂、2:真步真步王國、3:破曉之星、4:小小甜心',
  `background` mediumtext,
  `createDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '新增時間',
  PRIMARY KEY (`uid`,`server`),
  UNIQUE KEY `userId_UNIQUE` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='提供使用者綁定公主連結UID';

CREATE TABLE IF NOT EXISTS `sent_bulletin` (
  `id` int NOT NULL,
  `create_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='紀錄已發送的公告';

CREATE TABLE IF NOT EXISTS `subscribe_type` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` varchar(20) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TotalEventTimes` (
  `TET_DATE` varchar(6) NOT NULL,
  `TET_TEXT` int NOT NULL COMMENT '文字訊息次數',
  `TET_IMAGE` int NOT NULL COMMENT '圖片訊息次數',
  `TET_STICKER` int NOT NULL COMMENT '貼圖訊息次數',
  `TET_VIDEO` int NOT NULL COMMENT '影片訊息次數',
  `TET_UNSEND` int NOT NULL COMMENT '收回次數',
  PRIMARY KEY (`TET_DATE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='每月份事件總數紀錄';

CREATE TABLE IF NOT EXISTS `User` (
  `No` int NOT NULL AUTO_INCREMENT,
  `platform` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `platformId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` int NOT NULL DEFAULT '1',
  `createDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closeDTM` datetime DEFAULT NULL,
  PRIMARY KEY (`No`),
  UNIQUE KEY `platformId` (`platformId`,`platform`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `web_announcement` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `content` text NOT NULL,
  `level` varchar(20) NOT NULL,
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

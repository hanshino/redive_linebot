-- phpMyAdmin SQL Dump
-- version 5.0.4
-- https://www.phpmyadmin.net/
--
-- 主機： mysql
-- 產生時間： 2021 年 04 月 04 日 16:24
-- 伺服器版本： 8.0.23
-- PHP 版本： 7.4.15

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- 資料庫： `Princess`
--

-- --------------------------------------------------------

--
-- 資料表結構 `Admin`
--

CREATE TABLE IF NOT EXISTS `Admin` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `privilege` varchar(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- 資料表結構 `arena_like_records`
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- 資料表結構 `arena_records`
--

CREATE TABLE IF NOT EXISTS `arena_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `left_hash` varchar(255) NOT NULL,
  `right_hash` varchar(255) NOT NULL,
  `left_team` json NOT NULL COMMENT '左圖隊伍（自己）',
  `right_team` json NOT NULL COMMENT '右圖隊伍（對方）',
  `left_result` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '左圖勝負，1:勝利、0:失敗',
  `right_result` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '右圖勝負，1:勝利、0:失敗',
  `left_type` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '左圖類型，1:進攻、2:防守',
  `right_type` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '右圖類型，1:進攻、2:防守',
  `author_id` varchar(255) NOT NULL COMMENT '紀錄作者id',
  `source_id` varchar(255) NOT NULL COMMENT '紀錄來源id，作為是否分享的依據',
  `is_share` varchar(1) NOT NULL COMMENT '1:分享、0:自用',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `left_hash` (`left_hash`),
  KEY `right_hash` (`right_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='紀錄競技場勝負';

-- --------------------------------------------------------

--
-- 資料表結構 `BulletIn`
--

CREATE TABLE IF NOT EXISTS `BulletIn` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `sort` varchar(255) NOT NULL,
  `p` text NOT NULL,
  `date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `url` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公主公告儲存';

-- --------------------------------------------------------

--
-- 資料表結構 `chat_exp_unit`
--

CREATE TABLE IF NOT EXISTS `chat_exp_unit` (
  `unit_level` int NOT NULL,
  `total_exp` int NOT NULL,
  PRIMARY KEY (`unit_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='聊天經驗單位';

--
-- 資料表新增資料前，先清除舊資料 `chat_exp_unit`
--

TRUNCATE TABLE `chat_exp_unit`;
--
-- 傾印資料表的資料 `chat_exp_unit`
--

INSERT INTO `chat_exp_unit` (`unit_level`, `total_exp`) VALUES
(1, 0),
(2, 240),
(3, 720),
(4, 1200),
(5, 1680),
(6, 2160),
(7, 2880),
(8, 3600),
(9, 4320),
(10, 5040),
(11, 5760),
(12, 6480),
(13, 7200),
(14, 7920),
(15, 8640),
(16, 9560),
(17, 10680),
(18, 12000),
(19, 13520),
(20, 15240),
(21, 17160),
(22, 19280),
(23, 21420),
(24, 23580),
(25, 25760),
(26, 27960),
(27, 30190),
(28, 32450),
(29, 34740),
(30, 37060),
(31, 39480),
(32, 42000),
(33, 44620),
(34, 47340),
(35, 50160),
(36, 53080),
(37, 56100),
(38, 59620),
(39, 63640),
(40, 68160),
(41, 73180),
(42, 78700),
(43, 86220),
(44, 95740),
(45, 107260),
(46, 120780),
(47, 136300),
(48, 153820),
(49, 175340),
(50, 200860),
(51, 230380),
(52, 263900),
(53, 301420),
(54, 343940),
(55, 391460),
(56, 443980),
(57, 501500),
(58, 564020),
(59, 631540),
(60, 704060),
(61, 781580),
(62, 864100),
(63, 951620),
(64, 1045140),
(65, 1144660),
(66, 1250180),
(67, 1361700),
(68, 1479220),
(69, 1602740),
(70, 1732260),
(71, 1867780),
(72, 2009300),
(73, 2156820),
(74, 2310340),
(75, 2469860),
(76, 2635380),
(77, 2806900),
(78, 2984420),
(79, 3167940),
(80, 3357460),
(81, 3552980),
(82, 3754500),
(83, 3962020),
(84, 4175540),
(85, 4395060),
(86, 4620580),
(87, 4852100),
(88, 5089620),
(89, 5333140),
(90, 5582660),
(91, 5838180),
(92, 6099700),
(93, 6367220),
(94, 6640740),
(95, 6920260),
(96, 7205780),
(97, 7497300),
(98, 7794820),
(99, 8098340),
(100, 8407860),
(101, 8723380),
(102, 9044900),
(103, 9372420),
(104, 9705940),
(105, 10045460),
(106, 10390980),
(107, 10742500),
(108, 11100020),
(109, 11463540),
(110, 11833060),
(111, 12208580),
(112, 12590100),
(113, 12977620),
(114, 13371140),
(115, 13770660),
(116, 14176180),
(117, 14587700),
(118, 15005220),
(119, 15428740),
(120, 15858260),
(121, 16293780),
(122, 16735300),
(123, 17182820),
(124, 17636340),
(125, 18095860),
(126, 18561380),
(127, 19032900),
(128, 19510420),
(129, 19993940),
(130, 20483460),
(131, 20978980),
(132, 21480500),
(133, 21988020),
(134, 22501540),
(135, 23021060),
(136, 23546580),
(137, 24078100),
(138, 24615620),
(139, 25159140),
(140, 25708660),
(141, 26264180),
(142, 26825700),
(143, 27393220),
(144, 27966740),
(145, 28546260),
(146, 29131780),
(147, 29723300),
(148, 30320820),
(149, 30924340),
(150, 31533860),
(151, 32149380),
(152, 32770900),
(153, 33398420),
(154, 34031940),
(155, 34671460),
(156, 35316980),
(157, 35968500),
(158, 36626020),
(159, 37289540),
(160, 37959060),
(161, 38634580),
(162, 39316100),
(163, 40003620),
(164, 40697140),
(165, 41396660),
(166, 42102180),
(167, 42813700),
(168, 43531220),
(169, 44254740),
(170, 44984260),
(171, 45719780),
(172, 46461300),
(173, 47208820);

-- --------------------------------------------------------

--
-- 資料表結構 `chat_level_title`
--

CREATE TABLE IF NOT EXISTS `chat_level_title` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `title_range` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='聊天等級稱號';

--
-- 資料表新增資料前，先清除舊資料 `chat_level_title`
--

TRUNCATE TABLE `chat_level_title`;
--
-- 傾印資料表的資料 `chat_level_title`
--

INSERT INTO `chat_level_title` (`id`, `title`, `title_range`) VALUES
(1, '小屁孩', 1),
(2, '村民', 3),
(3, '見習冒險者', 6),
(4, '冒險者', 10),
(5, '魔族殺手', 10),
(6, '龍族殺手', 10),
(7, '神族殺手', 10),
(8, '異世界少年', 6),
(9, '見習勇者', 6),
(10, '實習勇者', 6),
(11, '遊俠', 3),
(12, '吟遊詩人', 3),
(13, '神官', 3),
(14, '騎士', 3);

-- --------------------------------------------------------

--
-- 資料表結構 `chat_range_title`
--

CREATE TABLE IF NOT EXISTS `chat_range_title` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='級距頭銜前贅';

--
-- 資料表新增資料前，先清除舊資料 `chat_range_title`
--

TRUNCATE TABLE `chat_range_title`;
--
-- 傾印資料表的資料 `chat_range_title`
--

INSERT INTO `chat_range_title` (`id`, `title`) VALUES
(1, '初級'),
(2, '中級'),
(3, '高級'),
(4, '銅級'),
(5, '銀級'),
(6, '金級'),
(7, '白金級'),
(8, '秘銀級'),
(9, '山銅級'),
(10, '精鋼級');

-- --------------------------------------------------------

--
-- 資料表結構 `chat_user_data`
--

CREATE TABLE IF NOT EXISTS `chat_user_data` (
  `id` int NOT NULL,
  `experience` int NOT NULL DEFAULT '1',
  `modify_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `rank` int NOT NULL DEFAULT '99999',
  UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='聊天制度用戶經驗';

-- --------------------------------------------------------

--
-- 資料表結構 `CustomerOrder`
--

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- 資料表結構 `GachaPool`
--

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

-- --------------------------------------------------------

--
-- 資料表結構 `GachaSignin`
--

CREATE TABLE IF NOT EXISTS `GachaSignin` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `signinDate` datetime NOT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- 資料表結構 `GlobalOrders`
--

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

-- --------------------------------------------------------

--
-- 資料表結構 `Guild`
--

CREATE TABLE IF NOT EXISTS `Guild` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `GuildId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Status` int NOT NULL DEFAULT '1',
  `CreateDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `CloseDTM` datetime DEFAULT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- 資料表結構 `GuildBattle`
--

CREATE TABLE IF NOT EXISTS `GuildBattle` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `GuildId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `FormId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Month` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `Status` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- 資料表結構 `GuildBattleConfig`
--

CREATE TABLE IF NOT EXISTS `GuildBattleConfig` (
  `GuildId` varchar(45) NOT NULL,
  `NotifyToken` varchar(255) NOT NULL,
  `SignMessage` varchar(255) NOT NULL,
  `modify_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`GuildId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='紀錄戰隊系統設定';

-- --------------------------------------------------------

--
-- 資料表結構 `GuildBattleFinish`
--

CREATE TABLE IF NOT EXISTS `GuildBattleFinish` (
  `id` int NOT NULL AUTO_INCREMENT,
  `GuildId` varchar(45) NOT NULL COMMENT '群組編號',
  `UserId` varchar(45) NOT NULL COMMENT '用戶編號',
  `CreateDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '新增日期',
  PRIMARY KEY (`id`),
  KEY `idxUserId` (`UserId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- 資料表結構 `GuildConfig`
--

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

-- --------------------------------------------------------

--
-- 資料表結構 `GuildMembers`
--

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

-- --------------------------------------------------------

--
-- 資料表結構 `GuildWeek`
--

CREATE TABLE IF NOT EXISTS `GuildWeek` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guildId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `month` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `week` varchar(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `modifyDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- 資料表結構 `IanUser`
--

CREATE TABLE IF NOT EXISTS `IanUser` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `platform` varchar(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ianUserId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `createDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID`),
  UNIQUE KEY `userId_UNIQUE` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- 資料表結構 `Inventory`
--

CREATE TABLE IF NOT EXISTS `Inventory` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `userId` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemId` int NOT NULL,
  `itemAmount` int NOT NULL DEFAULT '1',
  `createDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- 資料表結構 `MessageRecord`
--

CREATE TABLE IF NOT EXISTS `MessageRecord` (
  `ID` int NOT NULL,
  `MR_TEXT` int DEFAULT '0' COMMENT '文字訊息次數',
  `MR_IMAGE` int DEFAULT '0' COMMENT '圖片訊息次數',
  `MR_STICKER` int DEFAULT '0' COMMENT '貼圖次數記錄',
  `MR_VIDEO` int DEFAULT '0' COMMENT '影片訊息次數',
  `MR_UNSEND` int DEFAULT '0' COMMENT '訊息收回次數',
  `MR_MODIFYDTM` datetime DEFAULT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='訊息數據紀錄';

-- --------------------------------------------------------

--
-- 資料表結構 `notify_list`
--

CREATE TABLE IF NOT EXISTS `notify_list` (
  `id` int NOT NULL COMMENT '跟User編號一樣',
  `type` varchar(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '類型，1:Line Notify、2:Discord Webhook',
  `token` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '根據type儲存不同token',
  `sub_type` int NOT NULL DEFAULT '0',
  `status` varchar(1) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '1' COMMENT '1:開啟、0:關閉',
  `modify_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '修改時間',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='訂閱系統token紀錄';

-- --------------------------------------------------------

--
-- 資料表結構 `PrincessUID`
--

CREATE TABLE IF NOT EXISTS `PrincessUID` (
  `userId` varchar(45) NOT NULL COMMENT 'Line使用者ID',
  `uid` varchar(10) NOT NULL COMMENT '公主連結ID',
  `server` int NOT NULL COMMENT '遊戲伺服器，1:美食殿堂、2:真步真步王國、3:破曉之星、4:小小甜心',
  `background` mediumtext,
  `createDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '新增時間',
  PRIMARY KEY (`uid`,`server`),
  UNIQUE KEY `userId_UNIQUE` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='提供使用者綁定公主連結UID';

-- --------------------------------------------------------

--
-- 資料表結構 `sent_bulletin`
--

CREATE TABLE IF NOT EXISTS `sent_bulletin` (
  `id` int NOT NULL,
  `create_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='紀錄已發送的公告';

-- --------------------------------------------------------

--
-- 資料表結構 `subscribe_type`
--

CREATE TABLE IF NOT EXISTS `subscribe_type` (
  `id` int NOT NULL AUTO_INCREMENT,
  `type` varchar(20) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- 傾印資料表的資料 `subscribe_type`
--

INSERT INTO `subscribe_type` (`id`, `type`, `title`, `description`) VALUES
(1, 'PrincessNews', '公主連結消息', '可以接收公主連結最新公告。'),
(2, 'BotNews', '最新消息', '可以接收機器人功能最新消息更新，包括功能的修正、新增、刪除。'),
(3, 'ChatInfo', '等級系統消息', '可以接收等級系統的消息，例如：獲得了XX經驗、恭喜晉升為 36等 金級的龍族殺手。');

-- --------------------------------------------------------

--
-- 資料表結構 `TotalEventTimes`
--

CREATE TABLE IF NOT EXISTS `TotalEventTimes` (
  `TET_DATE` varchar(6) NOT NULL,
  `TET_TEXT` int NOT NULL COMMENT '文字訊息次數',
  `TET_IMAGE` int NOT NULL COMMENT '圖片訊息次數',
  `TET_STICKER` int NOT NULL COMMENT '貼圖訊息次數',
  `TET_VIDEO` int NOT NULL COMMENT '影片訊息次數',
  `TET_UNSEND` int NOT NULL COMMENT '收回次數',
  PRIMARY KEY (`TET_DATE`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='每月份事件總數紀錄';

-- --------------------------------------------------------

--
-- 資料表結構 `User`
--

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
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

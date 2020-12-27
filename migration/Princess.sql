-- phpMyAdmin SQL Dump
-- version 5.0.4
-- https://www.phpmyadmin.net/
--
-- 主機： mysql
-- 產生時間： 2020 年 12 月 27 日 08:10
-- 伺服器版本： 8.0.21
-- PHP 版本： 7.4.11

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
-- 資料表結構 `chat_exp_unit`
--

CREATE TABLE IF NOT EXISTS `chat_exp_unit` (
  `unit_level` int NOT NULL,
  `total_exp` int NOT NULL,
  PRIMARY KEY (`unit_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='聊天經驗單位';

--
-- 傾印資料表的資料 `chat_exp_unit`
--

INSERT INTO `chat_exp_unit` (`unit_level`, `total_exp`) VALUES
(1, 0),
(2, 24),
(3, 72),
(4, 120),
(5, 168),
(6, 216),
(7, 288),
(8, 360),
(9, 432),
(10, 504),
(11, 576),
(12, 648),
(13, 720),
(14, 792),
(15, 864),
(16, 956),
(17, 1068),
(18, 1200),
(19, 1352),
(20, 1524),
(21, 1716),
(22, 1928),
(23, 2142),
(24, 2358),
(25, 2576),
(26, 2796),
(27, 3019),
(28, 3245),
(29, 3474),
(30, 3706),
(31, 3948),
(32, 4200),
(33, 4462),
(34, 4734),
(35, 5016),
(36, 5308),
(37, 5610),
(38, 5962),
(39, 6364),
(40, 6816),
(41, 7318),
(42, 7870),
(43, 8622),
(44, 9574),
(45, 10726),
(46, 12078),
(47, 13630),
(48, 15382),
(49, 17534),
(50, 20086),
(51, 23038),
(52, 26390),
(53, 30142),
(54, 34394),
(55, 39146),
(56, 44398),
(57, 50150),
(58, 56402),
(59, 63154),
(60, 70406),
(61, 78158),
(62, 86410),
(63, 95162),
(64, 104514),
(65, 114466),
(66, 125018),
(67, 136170),
(68, 147922),
(69, 160274),
(70, 173226),
(71, 186778),
(72, 200930),
(73, 215682),
(74, 231034),
(75, 246986),
(76, 263538),
(77, 280690),
(78, 298442),
(79, 316794),
(80, 335746),
(81, 355298),
(82, 375450),
(83, 396202),
(84, 417554),
(85, 439506),
(86, 462058),
(87, 485210),
(88, 508962),
(89, 533314),
(90, 558266),
(91, 583818),
(92, 609970),
(93, 636722),
(94, 664074),
(95, 692026),
(96, 720578),
(97, 749730),
(98, 779482),
(99, 809834),
(100, 840786),
(101, 872338),
(102, 904490),
(103, 937242),
(104, 970594),
(105, 1004546),
(106, 1039098),
(107, 1074250),
(108, 1110002),
(109, 1146354),
(110, 1183306),
(111, 1220858),
(112, 1259010),
(113, 1297762),
(114, 1337114),
(115, 1377066),
(116, 1417618),
(117, 1458770),
(118, 1500522),
(119, 1542874),
(120, 1585826),
(121, 1629378),
(122, 1673530),
(123, 1718282),
(124, 1763634),
(125, 1809586),
(126, 1856138),
(127, 1903290),
(128, 1951042),
(129, 1999394),
(130, 2048346),
(131, 2097898),
(132, 2148050),
(133, 2198802),
(134, 2250154),
(135, 2302106),
(136, 2354658),
(137, 2407810),
(138, 2461562),
(139, 2515914),
(140, 2570866),
(141, 2626418),
(142, 2682570),
(143, 2739322),
(144, 2796674),
(145, 2854626),
(146, 2913178),
(147, 2972330),
(148, 3032082),
(149, 3092434),
(150, 3153386),
(151, 3214938),
(152, 3277090),
(153, 3339842),
(154, 3403194),
(155, 3467146),
(156, 3531698),
(157, 3596850),
(158, 3662602),
(159, 3728954),
(160, 3795906),
(161, 3863458),
(162, 3931610),
(163, 4000362),
(164, 4069714),
(165, 4139666),
(166, 4210218),
(167, 4281370),
(168, 4353122),
(169, 4425474),
(170, 4498426),
(171, 4571978),
(172, 4646130),
(173, 4720882);

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
(10, '初上陣的勇者', 6);

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
  PRIMARY KEY (`id`)
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
) ;

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
-- 資料表結構 `GlobalConfigs`
--

CREATE TABLE IF NOT EXISTS `GlobalConfigs` (
  `ID` int NOT NULL AUTO_INCREMENT,
  `type` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `content` text NOT NULL,
  PRIMARY KEY (`ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
-- 資料表結構 `GuildBattleFinish`
--

CREATE TABLE IF NOT EXISTS `GuildBattleFinish` (
  `id` int NOT NULL AUTO_INCREMENT,
  `GuildId` varchar(45) NOT NULL COMMENT '群組編號',
  `UserId` varchar(45) NOT NULL COMMENT '用戶編號',
  `CreateDTM` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '新增日期',
  PRIMARY KEY (`id`),
  KEY `idxUserId` (`UserId`)
) ;

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

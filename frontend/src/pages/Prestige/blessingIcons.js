import TranslateIcon from "@mui/icons-material/Translate";
import BoltIcon from "@mui/icons-material/Bolt";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import GroupsIcon from "@mui/icons-material/Groups";
import HomeWorkIcon from "@mui/icons-material/HomeWork";

export const BLESSING_ICONS = {
  language_gift: TranslateIcon,
  swift_tongue: BoltIcon,
  ember_afterglow: LocalFireDepartmentIcon,
  whispering: RecordVoiceOverIcon,
  rhythm_spring: GraphicEqIcon,
  star_guard: GroupsIcon,
  greenhouse: HomeWorkIcon,
};

export function getBlessingIcon(slug) {
  return BLESSING_ICONS[slug] || TranslateIcon;
}

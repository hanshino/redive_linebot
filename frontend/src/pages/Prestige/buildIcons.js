import AirIcon from "@mui/icons-material/Air";
import WavesIcon from "@mui/icons-material/Waves";
import DeviceThermostatIcon from "@mui/icons-material/DeviceThermostat";
import LandscapeIcon from "@mui/icons-material/Landscape";

export const BUILD_ICONS = {
  breeze: AirIcon,
  torrent: WavesIcon,
  temperature: DeviceThermostatIcon,
  solitude: LandscapeIcon,
};

export function getBuildIcon(key) {
  return BUILD_ICONS[key];
}

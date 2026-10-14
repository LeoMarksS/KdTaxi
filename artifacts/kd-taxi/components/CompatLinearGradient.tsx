import type { ComponentType } from "react";
import {
  LinearGradient as ExpoLinearGradient,
  type LinearGradientProps,
} from "expo-linear-gradient";

export const LinearGradient = ExpoLinearGradient as unknown as ComponentType<LinearGradientProps>;

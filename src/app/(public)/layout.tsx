import { Instrument_Serif, Manrope, Rubik_Burned } from "next/font/google";

const instrument = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const manrope = Manrope({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const rubikBurned = Rubik_Burned({ weight: "400", subsets: ["latin"], variable: "--font-rubik-burned", display: "swap" });

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <div className={`public-theme ${instrument.variable} ${manrope.variable} ${rubikBurned.variable}`}>{children}</div>;
}

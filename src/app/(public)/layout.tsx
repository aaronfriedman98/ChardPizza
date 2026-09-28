import { Cormorant_Garamond, Inter } from "next/font/google";

const cormorant = Cormorant_Garamond({
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-cormorant",
  display: "swap",
});
const inter = Inter({ weight: ["400", "500", "600"], subsets: ["latin"], variable: "--font-inter", display: "swap" });

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <div className={`public-theme ${cormorant.variable} ${inter.variable}`}>{children}</div>;
}

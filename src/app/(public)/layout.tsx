import { Anton, Poppins } from "next/font/google";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });
const poppins = Poppins({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-poppins", display: "swap" });

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <div className={`public-theme ${anton.variable} ${poppins.variable}`}>{children}</div>;
}

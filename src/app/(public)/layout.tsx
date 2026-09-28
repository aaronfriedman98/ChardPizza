import { Anton, Bodoni_Moda, Karla } from "next/font/google";

const bodoni = Bodoni_Moda({ weight: ["400", "500", "600", "700"], style: ["normal", "italic"], subsets: ["latin"], variable: "--font-bodoni", display: "swap" });
const karla = Karla({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-karla", display: "swap" });
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton", display: "swap" });

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`public-theme ${bodoni.variable} ${karla.variable} ${anton.variable}`}>
      {/* Grit filter for the wordmark: roughens the letter edges like the original flyer. */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="grit" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      {children}
    </div>
  );
}

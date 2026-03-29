import type { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"


type InstallPhoneIllustrationProps = HTMLAttributes<HTMLDivElement> & {
  frameColor?: string
  shadowColor?: string
  surfaceColor?: string
}


const RAW_INSTALL_PHONE_SVG = String.raw`<svg xmlns="http://www.w3.org/2000/svg" viewBox="241.1455 54.712 329.3875 661.009" width="100%">
  <g id="object-1" transform="matrix(1, 0, 0, 1, -5.684341886080802e-14, -2.842170943040401e-14)">
    <path id="Path_1805-110" data-name="Path 1805" d="M 508.504 715.721 L 301.133 715.721 C 269.994 715.686 244.76 690.452 244.725 659.313 L 244.725 111.12 C 244.76 79.981 269.994 54.747 301.133 54.712 L 508.504 54.712 C 539.643 54.747 564.874 79.981 564.909 111.12 C 568.774 331.257 575.351 577.78 564.909 659.314 C 564.874 690.453 539.643 715.686 508.504 715.721 Z" fill="#090814" style="stroke-width: 1;"/>
    <path id="Path_1806-111" data-name="Path 1806" d="M 567.804 256.355 C 566.483 256.356 565.416 257.424 565.416 258.741 L 565.416 335.104 C 565.381 336.94 567.349 338.127 568.958 337.238 C 569.728 336.811 570.2 335.989 570.182 335.104 L 570.182 258.741 C 570.182 257.424 569.115 256.357 567.804 256.355 Z" fill="#090814" style="stroke-width: 1;"/>
    <path id="Path_1807-112" data-name="Path 1807" d="M 559.539 111.12 L 559.539 659.304 C 559.539 686.202 538.672 708.485 511.828 710.239 L 511.816 710.239 C 511.422 710.263 511.029 710.287 510.623 710.299 C 509.923 710.335 509.215 710.347 508.499 710.347 C 508.499 710.347 505.876 710.156 501.078 709.798 C 496.234 709.44 489.184 708.903 480.389 708.199 C 477.752 707.996 474.967 707.773 472.037 707.531 C 466.19 707.053 459.771 706.529 452.884 705.932 C 450.14 705.706 447.3 705.455 444.401 705.205 C 429.582 703.928 412.985 702.437 395.481 700.744 C 392.523 700.47 389.54 700.184 386.533 699.886 C 385.746 699.798 250.093 665.702 250.093 659.306 L 250.093 111.12 C 250.091 82.928 272.946 60.073 301.138 60.076 L 331.614 60.076 C 336.466 60.12 340.469 63.886 340.811 68.725 C 340.846 69.047 340.882 69.37 340.942 69.692 C 341.945 74.573 346.279 78.051 351.261 77.972 L 458.375 77.972 C 463.358 78.051 467.691 74.573 468.694 69.692 C 468.754 69.37 468.79 69.047 468.825 68.725 C 469.167 63.884 473.173 60.118 478.026 60.076 L 508.499 60.076 C 536.687 60.073 559.548 82.928 559.539 111.119 L 559.539 111.12 Z" fill="#fff" style="stroke-width: 1;"/>
    <path id="Path_1808-113" data-name="Path 1808" d="M 243.533 199.084 C 242.215 199.085 241.147 200.153 241.146 201.471 L 241.146 220.56 C 241.111 222.397 243.077 223.584 244.686 222.695 C 245.461 222.267 245.935 221.445 245.918 220.56 L 245.918 201.47 C 245.917 200.153 244.85 199.086 243.533 199.084 Z" fill="#090814" style="stroke-width: 1;"/>
    <path id="Path_1809-114" data-name="Path 1809" d="M 243.533 256.355 C 242.215 256.356 241.147 257.424 241.146 258.741 L 241.146 295.73 C 241.111 297.566 243.077 298.753 244.686 297.864 C 245.461 297.437 245.935 296.615 245.918 295.73 L 245.918 258.741 C 245.917 257.424 244.85 256.357 243.533 256.355 Z" fill="#090814" style="stroke-width: 1;"/>
    <path id="Path_1810-115" data-name="Path 1810" d="M 243.533 308.854 C 242.216 308.856 241.149 309.923 241.148 311.239 L 241.148 348.232 C 241.113 350.069 243.079 351.256 244.688 350.367 C 245.463 349.94 245.937 349.118 245.92 348.232 L 245.92 311.239 C 245.918 309.922 244.85 308.855 243.533 308.854 Z" fill="#090814" style="stroke-width: 1;"/>
    <rect id="Rectangle_426" data-name="Rectangle 426" width="46.533" height="5.966" rx="0.31" fill="#e6e6e6" x="284.697" y="68.433" style="stroke-width: 1;"/>
    <circle id="Ellipse_369" data-name="Ellipse 369" cx="485.566" cy="69.626" r="4.772" fill="#e6e6e6" style="stroke-width: 1;"/>
    <circle id="Ellipse_370" data-name="Ellipse 370" cx="498.691" cy="69.626" r="4.772" fill="#e6e6e6" style="stroke-width: 1;"/>
    <circle id="Ellipse_371" data-name="Ellipse 371" cx="511.816" cy="69.626" r="4.772" fill="#e6e6e6" style="stroke-width: 1;"/>
    <path id="Path_1811-116" data-name="Path 1811" d="M 513.333 493.854 C 513.333 439.457 467.354 409.527 414.832 395.353 C 347.492 377.181 298.178 413.953 316.331 493.854 C 328.384 546.902 389.561 626.071 414.832 577.898 C 443.749 522.771 513.333 548.254 513.333 493.854 Z" fill="#f2f2f2" style="stroke-width: 1;"/>
    <path id="Path_1813-118" data-name="Path 1813" d="M 380.978 484.144 L 369.079 478.507 C 373.96 485.318 378.164 495.956 380.416 504.42 C 384.228 496.535 390.374 486.888 396.456 481.125 L 383.88 484.361 C 391.63 446.381 420.778 419.119 454.155 419.119 L 454.627 417.747 C 419.763 417.743 388.891 444.631 380.978 484.144 Z" fill="#090814" style="stroke-width: 1;"/>
    <path id="Path_1815-120" data-name="Path 1815" d="M 506.028 242.275 L 506.028 395.535 C 506.012 409.104 495.017 420.099 481.449 420.114 L 328.188 420.114 C 314.62 420.099 303.625 409.104 303.609 395.535 L 303.609 242.275 C 303.625 228.707 314.62 217.712 328.188 217.696 L 481.449 217.696 C 495.017 217.712 506.012 228.707 506.028 242.275 Z M 481.449 417.223 C 493.427 417.223 503.138 407.513 503.138 395.534 L 503.138 318.268 C 503.138 264.32 459.404 220.587 405.456 220.587 L 328.188 220.587 C 316.209 220.587 306.499 230.298 306.499 242.276 L 306.499 395.535 C 306.499 407.514 316.209 417.224 328.188 417.224 L 481.449 417.224 L 481.449 417.223 Z" fill="#090814" style="stroke-width: 1;"/>
    <g id="Group_112" data-name="Group 112" transform="matrix(0.87455, 0, 0, 0.87455, 346.92952, 275.765912)" style="">
      <path id="Path_1816-121" data-name="Path 1816" d="M221.187,158.062H164.612a2.587,2.587,0,1,1,0-5.173h56.575a2.587,2.587,0,0,1,0,5.173Z" transform="translate(-131.666 -152.888)" style="fill: rgb(255, 153, 102);"/>
      <path id="Path_1817-122" data-name="Path 1817" d="M221.187,191.425H164.612a2.587,2.587,0,1,1,0-5.173h56.575a2.587,2.587,0,0,1,0,5.173Z" transform="translate(-131.666 -131.093)" style="fill: rgb(255, 153, 102);"/>
      <path id="Path_1818-123" data-name="Path 1818" d="M204.187,237.425H147.612a2.587,2.587,0,1,1,0-5.173h56.575a2.587,2.587,0,0,1,0,5.173Z" transform="translate(-142.771 -101.044)" style="fill: rgb(255, 153, 102);"/>
      <path id="Path_1819-124" data-name="Path 1819" d="M263.542,174.754H146.249a2.587,2.587,0,1,1,0-5.173H263.542a2.587,2.587,0,0,1,0,5.173Z" transform="translate(-143.662 -141.984)" style="fill: rgb(255, 153, 102);"/>
    </g>
  </g>
</svg>`


/**
 * Returns the phone illustration SVG with theme-aware neutral colors.
 */
const buildInstallPhoneSvg = ({
  frameColor,
  shadowColor,
  surfaceColor,
}: {
  frameColor: string
  shadowColor: string
  surfaceColor: string
}) =>
  RAW_INSTALL_PHONE_SVG
    .replaceAll('fill="#090814"', `fill="${frameColor}"`)
    .replaceAll('stroke="#090814"', `stroke="${frameColor}"`)
    .replaceAll('fill="#f2f2f2"', `fill="${shadowColor}"`)
    .replaceAll('fill="#fff"', `fill="${surfaceColor}"`)


/**
 * Renders the install page phone illustration with customizable neutral tones.
 */
export function InstallPhoneIllustration({
  frameColor = "var(--foreground)",
  shadowColor = "var(--muted)",
  surfaceColor = "var(--card)",
  className,
  ...props
}: InstallPhoneIllustrationProps) {
  return (
    <div
      className={cn("w-full max-w-[330px] [&_svg]:h-auto [&_svg]:w-full", className)}
      dangerouslySetInnerHTML={{
        __html: buildInstallPhoneSvg({
          frameColor,
          shadowColor,
          surfaceColor,
        }),
      }}
      {...props}
    />
  )
}

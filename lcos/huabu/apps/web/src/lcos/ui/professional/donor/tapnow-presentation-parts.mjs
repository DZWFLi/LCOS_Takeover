// User-supplied local TapNow 2026-09-04 capture. Original definition bodies are unchanged.
// Inject only the host React JSX runtime and its existing class-name helper. No TapNow store/API/provider.

export function createTapnowPresentationParts({ jsxRuntime, classNames }) {
  const o = jsxRuntime;
  const z = classNames;

  // tapnow_raw/assets/vendor-pkg-canvas-CI-o9b4X.js :: jCe
  const jCe = () => o.jsx("div", {
    className: "absolute inset-0 bg-black/80 backdrop-blur-xs",
    "aria-hidden": !0
  });

  // tapnow_raw/assets/vendor-pkg-canvas-CI-o9b4X.js :: JCe
  const JCe = () => o.jsx("div", {
    className: "absolute inset-0 bg-black/80 backdrop-blur-xs [transform:translateZ(0)] [will-change:opacity]",
    "aria-hidden": !0
  });

  // tapnow_raw/assets/vendor-pkg-canvas-CI-o9b4X.js :: vX
  const vX = ({
    fields: e
  }) => e.length === 0 ? null : o.jsx("ul", {
    className: "space-y-2.5",
    children: e.map((t, n) => o.jsxs("li", {
      className: "text-[13px] leading-relaxed text-chat-foreground",
      children: [o.jsxs("span", {
        className: "font-medium text-foreground/95",
        children: [t.name, "："]
      }), t.value]
    }, n))
  });

  // tapnow_raw/assets/vendor-pkg-canvas-CI-o9b4X.js :: t6e
  const t6e = e => e.split("/").filter(Boolean).pop() ?? e;

  // tapnow_raw/assets/vendor-pkg-canvas-CI-o9b4X.js :: z0
  const z0 = ({
    text: e,
    keyword: t
  }) => {
    if (!t) return o.jsx(o.Fragment, {
      children: e
    });
    const n = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      s = e.split(new RegExp(`(${n})`, "gi"));
    return o.jsx(o.Fragment, {
      children: s.map((r, i) => r.toLowerCase() === t.toLowerCase() ? o.jsx("span", {
        className: "text-white/90",
        children: r
      }, i) : o.jsx("span", {
        children: r
      }, i))
    });
  };

  // tapnow_raw/assets/vendor-pkg-canvas-CI-o9b4X.js :: xm
  const xm = ({
    label: e,
    labelSuffix: t,
    required: n,
    fill: s = !1,
    children: r,
    className: i
  }) => o.jsxs("div", {
    className: z(s && "flex min-h-0 flex-1 flex-col", i),
    children: [o.jsxs("div", {
      className: "mb-2 block shrink-0 text-sm font-medium leading-5 text-secondary-muted-foreground",
      children: [o.jsx("span", {
        children: e
      }), n && "*", t ? o.jsxs(o.Fragment, {
        children: [" ", o.jsx("span", {
          className: "text-xs font-medium leading-4 text-secondary-accent",
          children: t
        })]
      }) : null]
    }), o.jsx("div", {
      className: z(s && "flex min-h-0 flex-1 flex-col"),
      children: r
    })]
  });

  // tapnow_raw/assets/vendor-pkg-canvas-CI-o9b4X.js :: Z1
  function Z1({
    label: e
  }) {
    return o.jsxs("div", {
      className: "flex shrink-0 items-center gap-1 text-xs text-[#22c55e]",
      children: [o.jsxs("svg", {
        width: "14",
        height: "14",
        viewBox: "0 0 14 14",
        fill: "none",
        "aria-hidden": !0,
        children: [o.jsx("circle", {
          cx: "7",
          cy: "7",
          r: "6",
          stroke: "#22c55e",
          strokeWidth: "1.5"
        }), o.jsx("path", {
          d: "M4.5 7l1.8 1.8L9.5 5.5",
          stroke: "#22c55e",
          strokeWidth: "1.5",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        })]
      }), o.jsx("span", {
        children: e
      })]
    });
  }

  // tapnow_raw/assets/vendor-pkg-canvas-CI-o9b4X.js :: F5
  const F5 = e => {
    const t = Math.floor(e / 60),
      n = Math.floor(e % 60);
    return `${String(t).padStart(2, "0")}:${String(n).padStart(2, "0")}`;
  };

  return { MediaBackdrop: jCe, VideoBackdrop: JCe, StructuredFields: vX, fileBasename: t6e, InlineHighlight: z0, FieldLabel: xm, SuccessStatus: Z1, formatMediaTime: F5 };
}

export function createTapnowIcons({ jsxRuntime, classNames }) {
  const a = jsxRuntime;

  // tapnow_raw/assets/vendor-packages-UcYjV2uG.js :: rR
  const rR = ({
    className: e,
    size: t = 16
  }) => a.jsx("svg", {
    width: t,
    height: t,
    viewBox: "0 0 16 16",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    className: e,
    children: a.jsx("path", {
      d: "M12.2021 6.20215C12.5335 6.20215 12.8017 6.47047 12.8018 6.80176V8.00195C12.8018 9.27544 12.296 10.497 11.3955 11.3975C10.6377 12.1553 9.65271 12.6321 8.60059 12.7646V14.0049C8.60056 14.3361 8.33212 14.6042 8.00098 14.6045C7.66962 14.6045 7.40042 14.3362 7.40039 14.0049V12.7646C6.34827 12.6321 5.36328 12.1553 4.60547 11.3975C3.70498 10.497 3.19922 9.27544 3.19922 8.00195V6.80176C3.19931 6.47047 3.46752 6.20215 3.79883 6.20215C4.13014 6.20215 4.39834 6.47047 4.39844 6.80176V8.00195C4.39844 8.95718 4.77866 9.87338 5.4541 10.5488C6.12955 11.2243 7.04575 11.6045 8.00098 11.6045C8.95603 11.6044 9.87154 11.2242 10.5469 10.5488C11.2223 9.87338 11.6025 8.95718 11.6025 8.00195V6.80176C11.6026 6.47049 11.8709 6.20218 12.2021 6.20215ZM8.00098 1.40039C9.32665 1.40064 10.4014 2.47505 10.4014 3.80078V8.00195C10.4014 9.32769 9.32665 10.4031 8.00098 10.4033L8 10.4023V10.4033C7.08853 10.4033 6.29612 9.89493 5.88965 9.14648C5.70474 8.80621 5.59961 8.41633 5.59961 8.00195V3.80078C5.59961 3.38633 5.70468 2.99644 5.88965 2.65625C6.29615 1.90818 7.0886 1.40039 8 1.40039H8.00098Z",
      fill: "currentColor",
      fillOpacity: "0.9"
    })
  });

  // tapnow_raw/assets/vendor-packages-UcYjV2uG.js :: oR
  const oR = ({
    className: e,
    size: t = 16
  }) => a.jsx("svg", {
    width: t,
    height: t,
    viewBox: "0 0 16 16",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    className: e,
    children: a.jsx("path", {
      d: "M8.00052 12.2041V14.0048M8.00052 12.2041C9.11488 12.2041 10.1836 11.7614 10.9716 10.9735C11.7595 10.1855 12.2022 9.11678 12.2022 8.00242V6.80193M8.00052 12.2041C6.88616 12.2041 5.81745 11.7614 5.02948 10.9735C4.24151 10.1855 3.79883 9.11678 3.79883 8.00242V6.80193M8.00052 2C8.99503 2 9.80125 2.80621 9.80125 3.80073V8.00242C9.80125 8.99693 8.99503 9.80314 8.00052 9.80314C7.00601 9.80314 6.1998 8.99693 6.1998 8.00242V3.80073C6.1998 2.80621 7.00601 2 8.00052 2Z",
      stroke: "currentColor",
      strokeWidth: "1.2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    })
  });

  // tapnow_raw/assets/vendor-packages-UcYjV2uG.js :: $S
  const $S = ({
    className: e,
    size: t = 16,
    strokeWidth: n
  }) => a.jsx("svg", {
    width: t,
    height: t,
    viewBox: "0 0 16 16",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    className: e,
    "aria-hidden": !0,
    children: a.jsx("path", {
      d: "M8.16431 7.51599C8.32204 7.48359 8.48614 7.49821 8.63599 7.55701L14.636 9.89001H14.637C14.7775 9.94496 14.9004 10.037 14.9924 10.1556L15.0295 10.2084L15.0627 10.264C15.1353 10.3956 15.1715 10.5447 15.1663 10.6957C15.1602 10.8682 15.101 11.035 14.9963 11.1722C14.8917 11.3094 14.7469 11.4108 14.5823 11.4623H14.5813L12.2854 12.1742H12.2844C12.2586 12.1822 12.2352 12.197 12.2161 12.2162C12.197 12.2353 12.1821 12.2588 12.1741 12.2845L11.4631 14.5804V14.5814C11.4117 14.746 11.3102 14.8908 11.1731 14.9955C11.0358 15.1002 10.8691 15.1594 10.6965 15.1654C10.524 15.1714 10.3535 15.1235 10.2092 15.0287C10.0652 14.9339 9.95366 14.7967 9.89087 14.6361V14.6351L7.55786 8.63513L7.52173 8.5199C7.49447 8.40334 7.49257 8.28164 7.51685 8.16345C7.54967 8.00422 7.62845 7.85751 7.74341 7.74255C7.85837 7.6276 8.00507 7.54881 8.16431 7.51599ZM9.39966 1.83337C10.1379 1.83337 10.722 1.83312 11.1917 1.87146C11.6672 1.91031 12.0703 1.99093 12.4377 2.1781C13.0335 2.4817 13.518 2.96706 13.8215 3.56287C14.0086 3.9302 14.0893 4.33258 14.1282 4.80798C14.1665 5.27771 14.1663 5.86158 14.1663 6.59998V7.28455C14.1663 7.56069 13.9424 7.78455 13.6663 7.78455C13.3903 7.78437 13.1663 7.56058 13.1663 7.28455V6.59998C13.1663 5.84506 13.1664 5.30861 13.1321 4.88904C13.0983 4.47546 13.0343 4.21892 12.9309 4.01599C12.7232 3.60841 12.3912 3.27741 11.9836 3.0697C11.7807 2.96628 11.5243 2.90234 11.1106 2.86853C10.691 2.83425 10.1546 2.83337 9.39966 2.83337H6.59985C5.84493 2.83337 5.30848 2.83425 4.88892 2.86853C4.47537 2.90234 4.21879 2.96631 4.01587 3.0697C3.60849 3.27737 3.27725 3.60862 3.06958 4.01599C2.96618 4.21892 2.90222 4.47549 2.86841 4.88904C2.83413 5.30861 2.83325 5.84506 2.83325 6.59998V9.39978C2.83325 10.1547 2.83413 10.6911 2.86841 11.1107C2.90221 11.5245 2.96616 11.7808 3.06958 11.9838C3.27729 12.3913 3.60829 12.7233 4.01587 12.931C4.2188 13.0344 4.47534 13.0984 4.88892 13.1322C5.30848 13.1665 5.84493 13.1664 6.59985 13.1664H7.28442C7.56046 13.1664 7.78425 13.3904 7.78442 13.6664C7.78442 13.9425 7.56057 14.1664 7.28442 14.1664H6.59985C5.86146 14.1664 5.27758 14.1667 4.80786 14.1283C4.33245 14.0895 3.93008 14.0087 3.56274 13.8217C2.96694 13.5181 2.48158 13.0337 2.17798 12.4379C1.99081 12.0705 1.91019 11.6673 1.87134 11.1918C1.83299 10.7221 1.83325 10.138 1.83325 9.39978V6.59998C1.83325 5.86158 1.83297 5.27771 1.87134 4.80798C1.91018 4.33262 1.99095 3.93017 2.17798 3.56287C2.48158 2.96702 2.9669 2.4817 3.56274 2.1781C3.93005 1.99107 4.3325 1.9103 4.80786 1.87146C5.27758 1.83309 5.86146 1.83337 6.59985 1.83337H9.39966ZM10.6497 13.8275L11.219 11.9886C11.2751 11.8075 11.3749 11.6423 11.509 11.5082C11.643 11.3743 11.8076 11.2752 11.9885 11.2191L13.8284 10.6488L8.62622 8.62537L10.6497 13.8275Z",
      fill: "currentColor",
      stroke: n ? "currentColor" : void 0,
      strokeWidth: n,
      strokeLinejoin: "round"
    })
  });

  return { MicrophoneSolid: rR, MicrophoneOutline: oR, InsertFromCanvasIcon: $S };
}

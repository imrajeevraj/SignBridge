# Phase 4 — Single-Signer Region of Interest (ROI) Design

### 1. Motivation and Problem Formulation
In video conference layouts (such as Google Meet), a meeting window typically contains multiple tiles: participant faces, presentation screens, chat sidebars, and native controls. Feeding the entire meeting tab into MediaPipe introduces three critical problems:
1. **Resolution Degradation**: The target signer's hands and upper body occupy only a small fraction of the 1080p canvas, lowering landmark detection recall.
2. **Multi-Person Ambiguity**: MediaPipe detects multiple hands or arbitrary faces in other tiles, causing landmark tracking discontinuities.
3. **Computational Inefficiency**: Processing full HD tabs exceeds acceptable per-frame time budgets.

Phase 4 solves this by empowering the user to select the **single signer's video region** using an interactive, non-destructive overlay.

---

### 2. Normalized Coordinate Space & Transformations

To ensure complete independence from device pixel ratios (DPR), client zoom, responsive CSS grid resizing, and capture resolutions, ROI coordinates are strictly normalized to $[0, 1]$ relative to the browser viewport:

$$\begin{aligned}
x_{\text{norm}} &= \frac{\min(x_{\text{start}}, x_{\text{end}})}{W_{\text{viewport}}} \\
y_{\text{norm}} &= \frac{\min(y_{\text{start}}, y_{\text{end}})}{H_{\text{viewport}}} \\
w_{\text{norm}} &= \frac{|x_{\text{end}} - x_{\text{start}}|}{W_{\text{viewport}}} \\
h_{\text{norm}} &= \frac{|y_{\text{end}} - y_{\text{start}}|}{H_{\text{viewport}}}
\end{aligned}$$

#### Mapping to Captured Video Stream
In the Offscreen document, the captured `<video>` element has intrinsic dimensions $W_{\text{vid}} \times H_{\text{vid}}$. The crop rect in video pixels is computed deterministically:

$$\begin{aligned}
x_{\text{vid}} &= \text{round}(x_{\text{norm}} \cdot W_{\text{vid}}) \\
y_{\text{vid}} &= \text{round}(y_{\text{norm}} \cdot H_{\text{vid}}) \\
w_{\text{vid}} &= \text{round}(w_{\text{norm}} \cdot W_{\text{vid}}) \\
h_{\text{vid}} &= \text{round}(h_{\text{norm}} \cdot H_{\text{vid}})
\end{aligned}$$

#### Aspect-Preserving Downscaling
If $w_{\text{vid}} > 640\text{px}$, the crop is uniformly scaled down to $\le 640\text{px}$ width:
$$\text{scale} = \frac{640}{w_{\text{vid}}}, \quad w_{\text{dest}} = 640, \quad h_{\text{dest}} = \text{round}(h_{\text{vid}} \cdot \text{scale})$$
This guarantees the MediaPipe input conforms to the optimal performance boundary established in Phase 3.

---

### 3. Validation Invariants
The validator (`src/roi/roi-validator.ts`) enforces the following boundaries:
1. **Non-negativity & Bounding**: $0 \le x_{\text{norm}} < 1$, $0 \le y_{\text{norm}} < 1$, $x_{\text{norm}} + w_{\text{norm}} \le 1.001$, $y_{\text{norm}} + h_{\text{norm}} \le 1.001$.
2. **Minimum Dimensions**: $w_{\text{norm}} \ge 0.05$ and $h_{\text{norm}} \ge 0.05$ (at least 5% of screen).
3. **Minimum Absolute Pixels**: $w_{\text{vid}} \ge 64\text{px}$ and $h_{\text{vid}} \ge 64\text{px}$ (essential for landmark feature extraction).
4. **Aspect Ratio Sanity**: $0.2 \le \frac{w_{\text{norm}}}{h_{\text{norm}}} \le 5.0$ (rejects degenerate thin slivers).

---

### 4. Interactive UX
- Injected on-demand inside an isolated Shadow DOM (`#signbridge-roi-host`).
- Semi-transparent scrim (`rgba(0, 0, 0, 0.45)`).
- Cyan dashed border (`#00e5ff`) with 4 corner resize handles.
- Action bar with **Confirm ROI** and **Cancel** buttons, plus `Escape` key cancellation.
- Upon confirmation, coordinates are transmitted to background via `ROI_SELECTED`, and the overlay immediately unmounts.


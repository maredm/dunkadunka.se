"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLORS = void 0;
exports.plot = plot;
exports.COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];
function addPlotToList(tabId, plotId, plotName, hidden = false) {
    const plotList = document.getElementById(`plot-list-${tabId}`);
    const listItem = document.createElement('li');
    listItem.innerHTML = `<input type="checkbox" id="checkbox-${plotId}" alt="show/hide" ${hidden ? '' : 'checked'}><label for="checkbox-${plotId}">${plotName}</label>`;
    plotList.appendChild(listItem);
}
function addPlotElement(tabId, plotId, hidden = false) {
    var _a;
    const tabContent = document.querySelector(`[data-content="${tabId}"]`);
    const plotBox = document.createElement('div');
    plotBox.className = 'plot-box';
    plotBox.innerHTML = `
        <div id="${plotId}" class="plot-medium"></div>
        <div class="button-bar">
            <button>Customize...</button>
            <button>Export as...</button>   
            <label for="checkbox-${plotId}">Hide</label>
        </div>
    `;
    (_a = tabContent.querySelector('.plot-outer')) === null || _a === void 0 ? void 0 : _a.appendChild(plotBox);
    if (hidden) {
        plotBox.style.display = 'none';
    }
    return plotBox.querySelector(`#${plotId}`);
}
function plot(traces, tabId, title, xTitle, yTitle, xAxisExtras = {}, yAxisExtras = {}, layoutExtras = {}, hidden = false) {
    var _a;
    const plotSettings = {
        plotGlPixelRatio: 2, // For better clarity on high-DPI screens
        legend: { "orientation": "h", "y": -0.2, "yanchor": "top" },
        plot_bgcolor: '#fafbfc',
        paper_bgcolor: '#fff',
        staticPlot: false, // Enable interactivity
        dragmode: 'pan',
        showAxisDragHandles: true,
        showAxisRangeEntryBoxes: true,
        axisDragOnHover: true,
        tightenLats: true,
        font: {
            family: "'Newsreader', Georgia, 'Times New Roman', Times, serif",
        },
        margin: { t: 80, r: 65, b: 70, l: 65 }
    };
    const layout = Object.assign(Object.assign({ title: title, xaxis: Object.assign({ title: xTitle, gridcolor: '#e1e4e8' }, xAxisExtras), yaxis: Object.assign({ title: yTitle, gridcolor: '#e1e4e8', automargin: true }, yAxisExtras) }, layoutExtras), plotSettings);
    const plotId = `plot-${tabId}-${title.toLowerCase().replace(/\s+/g, '-')}`;
    const element = addPlotElement(tabId, plotId, hidden);
    window.Plotly.newPlot(element, traces, layout, { responsive: true });
    addPlotToList(tabId, plotId, title, hidden);
    (_a = document.getElementById(`checkbox-${plotId}`)) === null || _a === void 0 ? void 0 : _a.addEventListener('change', (e) => {
        const box = document.getElementById(`${plotId}`).parentElement;
        box.setAttribute('style', e.target.checked ? 'display: block;' : 'display: none;');
        window.dispatchEvent(new Event('resize'));
    });
    console.log(`Plotted ${title} in tab ${tabId}`);
}

export const COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];

function addPlotToList(tabId: string, plotId: string, plotName: string, hidden: boolean = false): void {
    const plotList = document.getElementById(`plot-list-${tabId}`) as HTMLElement;
    const listItem = document.createElement('li');
    listItem.innerHTML = `<input type="checkbox" id="checkbox-${plotId}" alt="show/hide" ${hidden ? '' : 'checked'}><label for="checkbox-${plotId}">${plotName}</label>`;
    plotList.appendChild(listItem);
}

function addPlotElement(tabId: string, plotId: string, hidden: boolean = false): HTMLElement {
    const tabContent = document.querySelector(`[data-content="${tabId}"]`) as HTMLElement;
    
    if (!tabContent) {
        console.error('Tab content not found for tabId:', tabId);
        throw new Error(`Tab content not found for tabId: ${tabId}`);
    }
    
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
    
    const plotOuter = tabContent.querySelector('.plot-outer');
    if (!plotOuter) {
        console.error('Plot outer container not found in tab:', tabId);
        throw new Error(`Plot outer container not found in tab: ${tabId}`);
    }
    
    plotOuter.appendChild(plotBox);
    
    if (hidden) {
        plotBox.style.display = 'none';
    }
    
    const element = plotBox.querySelector(`#${plotId}`) as HTMLElement;
    
    if (!element) {
        console.error('Plot element not found after creation. plotId:', plotId);
        throw new Error(`Plot element not found after creation: ${plotId}`);
    }
    
    return element;
}

export function plot(
    traces: any[], 
    tabId: string,
    title: string, 
    xTitle: string, 
    yTitle: string, 
    xAxisExtras: any = {},
    yAxisExtras: any = {},
    layoutExtras: any = {},
    hidden: boolean = false,
): void {
    const plotSettings: {[key: string]: any} = {
        plotGlPixelRatio: 2, // For better clarity on high-DPI screens
        legend: {"orientation": "h", "y": -0.2, "yanchor": "top"},
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

    const layout = {
        title: title,
        xaxis: { 
            title: xTitle,
            gridcolor: '#e1e4e8',
            //tickformat: '.0f',
            ...xAxisExtras
        },
        yaxis: { 
            title: yTitle,
            gridcolor: '#e1e4e8',
            automargin: true,
            ...yAxisExtras
        },
        ...layoutExtras,
        ...plotSettings
    };

    const plotId = `plot-${tabId}-${title.toLowerCase().replace(/\s+/g, '-')}`;

    const element = addPlotElement(tabId, plotId, hidden);
    (window as any).Plotly.newPlot(element, traces, layout, {responsive: true});
    addPlotToList(tabId, plotId, title, hidden);

    document.getElementById(`checkbox-${plotId}`)?.addEventListener('change', (e) => {
        const box = document.getElementById(`${plotId}`)!.parentElement!;
        box.setAttribute('style', (e.target as HTMLInputElement).checked ? 'display: block;' : 'display: none;');
        window.dispatchEvent(new Event('resize'));
    });

    console.log(`Plotted ${title} in tab ${tabId}`);
}


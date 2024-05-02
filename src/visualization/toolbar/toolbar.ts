import Restart from '@material-design-icons/svg/filled/restart_alt.svg'
import Search from '@material-design-icons/svg/filled/search.svg'
import './toolbar.css'

export default class GraphToolbar extends HTMLElement {
    // noinspection JSUnusedGlobalSymbols
    connectedCallback() {
        this.setAttribute('class', `${this.getAttribute('class') ?? ''} graph-toolbar`.trim())

        this.innerHTML = `
            <button class="reset-graph">
                ${this.decodeIcon(Restart)}
            </button>
            <label>
                <input placeholder="Search username…">
                <button class="submit-search">
                    ${this.decodeIcon(Search)}
                </button>
            </label>
        `

        this.querySelector('.reset-graph').addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('reset-graph'))
        })

        const search = this.querySelector('input');
        const dispatchSearch = () => this.dispatchEvent(new CustomEvent('search-user', {detail: search.value}))

        search.addEventListener('keypress', (event) => {
            if (event.key !== 'Enter') return
            dispatchSearch()
        })

        this.querySelector('.submit-search').addEventListener('click', dispatchSearch)
    }

    decodeIcon(data: string): string {
        const preamble = 'data:image/svg+xml;base64,'

        if (data.startsWith(preamble)) {
            return atob(data.substring(preamble.length))
        } else {
            // noinspection HtmlRequiredAltAttribute
            return `<img src="${data}">`
        }
    }
}

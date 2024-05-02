import MaterialRemoveColor from '@material-design-icons/svg/filled/invert_colors_off.svg'
import MaterialZoomIn from '@material-design-icons/svg/filled/zoom_in_map.svg'
import MaterialSearch from '@material-design-icons/svg/filled/search.svg'
import './toolbar.css'

export default class GraphToolbar extends HTMLElement {
    // noinspection JSUnusedGlobalSymbols
    connectedCallback() {
        this.setAttribute('class', `${this.getAttribute('class') ?? ''} graph-toolbar`.trim())

        this.innerHTML = `
            <button class="remove-highlighting">
                ${this.decodeIcon(MaterialRemoveColor)}
            </button>
            <button class="reset-positioning">
                ${this.decodeIcon(MaterialZoomIn)}
            </button>
            <label>
                <input placeholder="Search username…">
                <button class="submit-search">
                    ${this.decodeIcon(MaterialSearch)}
                </button>
            </label>
        `

        this.querySelector('.remove-highlighting').addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('remove-highlighting'))
        })

        this.querySelector('.reset-positioning').addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('reset-positioning'))
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

import MaterialRemoveColor from '@material-design-icons/svg/filled/invert_colors_off.svg'
import MaterialZoomIn from '@material-design-icons/svg/filled/zoom_in_map.svg'
import MaterialSearch from '@material-design-icons/svg/filled/search.svg'
import './toolbar.css'

export default class GraphToolbar extends HTMLElement {
    // noinspection JSUnusedGlobalSymbols
    connectedCallback() {
        this.classList.add('graph-toolbar')

        this.innerHTML = `
            <button class="remove-highlighting">
                <material-icon data="${MaterialRemoveColor}"></material-icon>
            </button>
            <button class="reset-positioning">
                <material-icon data="${MaterialZoomIn}"></material-icon>
            </button>
            <label>
                <input placeholder="Search username…">
                <button class="submit-search">
                    <material-icon data="${MaterialSearch}"></material-icon>
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
        search.addEventListener("input", () => this.clearSearchError())

        const dispatchSearch = () => this.dispatchEvent(new CustomEvent('search-user', {detail: search.value}))
        this.querySelector('.submit-search').addEventListener('click', dispatchSearch)
        search.addEventListener('keypress', (event) => {
            if (event.key !== 'Enter') return
            dispatchSearch()
        })
    }

    setSearchError(message?: string) {
        this.querySelector('label').setAttribute("error", message ?? 'error')
    }

    clearSearchError() {
        this.querySelector('label').removeAttribute("error")
    }

    clearSearch() {
        this.querySelector('input').value = ''
    }
}

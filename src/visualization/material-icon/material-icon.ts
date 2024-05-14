import './material-icon.css'

export default class MaterialIcon extends HTMLElement {
    static dataAttribute = 'data'

    data: string

    // noinspection JSUnusedGlobalSymbols
    static get observedAttributes() {
        return [MaterialIcon.dataAttribute]
    }

    // noinspection JSUnusedGlobalSymbols
    attributeChangedCallback(property: string, oldValue: string, newValue: string) {
        if (oldValue === newValue) return

        if (property === MaterialIcon.dataAttribute) {
            this.data = newValue
            this.setIcon(this.data)
        }
    }

    // noinspection JSUnusedGlobalSymbols
    connectedCallback() {
        this.classList.add('material-icon')
        this.setIcon(this.data)
    }

    setIcon(data: string) {
        const preamble = 'data:image/svg+xml;base64,'

        if (data.startsWith(preamble)) {
            this.innerHTML = atob(data.substring(preamble.length))
        } else {
            // noinspection HtmlRequiredAltAttribute
            this.innerHTML = `<img src="${data}">`
        }
    }
}

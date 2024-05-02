import MaterialPerson from '@material-design-icons/svg/filled/person.svg';
import './user-count.css'

export default class UserCount extends HTMLElement {
    static countAttribute = 'count'

    count: number = 0

    // noinspection JSUnusedGlobalSymbols
    static get observedAttributes() {
        return [UserCount.countAttribute]
    }

    // noinspection JSUnusedGlobalSymbols
    attributeChangedCallback(property: string, oldValue: string, newValue: string) {
        if (oldValue === newValue) return

        if (property === UserCount.countAttribute) {
            this.count = parseInt(newValue, 10)
            this.setCount(this.count)
        }
    }

    connectedCallback() {
        this.classList.add('user-count')
        this.setCount(this.count)
    }

    setCount(count: number) {
        this.innerHTML = `
            <material-icon data="${MaterialPerson}"></material-icon>
            <span>${count}</span>
        `
    }
}

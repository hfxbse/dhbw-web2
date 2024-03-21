import {createInterface} from "readline";
import {stdin, stdout} from "process";
import {login} from "./instagram.js";

const prompt = createInterface({
    input: stdin,
    output: stdout
})

function ask(question: string): Promise<string> {
    return new Promise((resolve) => prompt.question(question, resolve))
}

const user = await ask("Instagram username, phone number, or email: ")
const password = await ask("Password: ")

prompt.close()

console.log(await login({user, password}));

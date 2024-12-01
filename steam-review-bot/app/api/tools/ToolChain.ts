

// Creates tool for use in route.ts
import { AzureChatOpenAI } from "@langchain/openai";
import { tool, StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { renderTextDescription } from "langchain/tools/render";
import { RunnablePassthrough, RunnablePick, RunnableLambda } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AIMessageChunk } from "@langchain/core/messages";
import { SteamReviewsAPI } from "./Steam";

const tool_model = new AzureChatOpenAI({
  azureOpenAIApiDeploymentName: "gpt4v2",
  azureOpenAIApiKey: "6fcf24c200bb4ca1bedd7fb7c32a7f47",
  azureOpenAIApiInstanceName: "dbrog-m2agopml-eastus",
  azureOpenAIEndpoint: "https://dbrog-m2agopml-eastus.openai.azure.com/",
  azureOpenAIApiVersion: "2024-08-01-preview",
  temperature: 0
});

// List of tools that call Open Library wrapper functions and provide schema for when to use
const steamFetchReviewsTool = tool(
async (input) => {
    return await SteamReviewsAPI.fetchReviews(input.name);
},
{
    name: "steamFetchReviews",
    description: "Returns steam reviews when given a game name",
    schema: z.object({
    name: z.string().describe("The name of the game to search for."),
    }),
}
)

// List of available tools to provide toolChain
const tools = [steamFetchReviewsTool];

const toolChain = (modelOutput: { name: string; arguments: { name: string } | { title: string } }) => {
    console.log(modelOutput.arguments)
    // If no tool is chosen, indicate that in retured JSON output with tool name of none
    if (modelOutput.name === "none") {
        console.log("No tool used.")
        return new RunnableLambda({
        func: () => ("Model output was not valid JSON. No tool was invoked.")
        });
    }

    const toolMap: Record<string, StructuredToolInterface> = Object.fromEntries(
        tools.map((tool) => [tool.name, tool])
    );
    const chosenTool = toolMap[modelOutput.name];
    console.log("Using tool: " + modelOutput.name)
    return new RunnablePick("arguments").pipe(
        new RunnableLambda({
        func: (input: string) =>
            chosenTool.invoke(input),
        })
    );
};

const toolChainRunnable = new RunnableLambda({
func: toolChain,
});

const renderedTools = renderTextDescription(tools);

const systemPrompt = `
You are an assistant that has access to the following tool to retrieve game reviews

{{rendered_tools}}

When analyzing user input, identify if the user mentions a specific video game in their prompt. If a game is mentioned, use the tool to find reviews from it.

Always use the JSON format below, and never add extra text. Here is the required response format:

{{
"name": "steamFetchReviews",
"arguments": {{
    "name": "<GAME_NAME>"
}}
}}

If no tool should be used, always respond with:
{{
"name": "none",
"arguments": {{}}
}}

### Important Notes:
- Only output a valid JSON object, and do not add anything else.
- Always use the exact key names and structure as shown.
- If the user input is ambiguous, assume that "<BOOK_TITLE>" is the name of the book that was provided.

Example output:
Game: The Colonists
{{
"name": "steamFetchReviews",
"arguments": {{
    "name": "The Colonists"
}}
}}

If no book or author is mentioned, or indication that an image should be generated, respond with:

{{
"name": "none",
"arguments": {{}}
}}
`;

const tool_prompt = ChatPromptTemplate.fromMessages([
["system", systemPrompt],
["user", "{input}"],
]);

type ModelOutput = {
  name: string;
  arguments: { name: string } | { title: string };
  output: string;
};
const tool_chain = tool_prompt
.pipe(tool_model)
.pipe(new RunnableLambda<AIMessageChunk, ModelOutput>({
  func: async (modelOutput: AIMessageChunk) => {
    // Extract the content from AIMessageChunk
    const modelContent = modelOutput.content;
    // Check that stringified JSON is received
    if (typeof modelContent !== 'string') {
      console.error("Expected content to be a string but got:", typeof modelContent);
      return {
        name: "none",
        arguments: {},
        output: "Invalid output format. Expected a string. No tool was invoked."
      };
    }

    // Validate and parse JSON output
    let parsedOutput;
    try {
      parsedOutput = JSON.parse(modelContent);
    } catch (error) {
      // If invalid JSON error is caught, no tool is required and response below is sent.
      return {
        name: "none",
        arguments: {},
        output: "Model output was not valid JSON. No tool was invoked."
      };
    }

    // Return parsed output, explicitly add output property
    return {
      ...parsedOutput,
      output: parsedOutput // Adding 'output' explicitly
    };
  }
}))
.pipe(RunnablePassthrough.assign({ output: toolChainRunnable }));

type ToolChainResponse = {
  name: string;
  arguments: { name: string } | { title: string };
  output: string;
};

export async function toolChainInput(input: string): Promise<ToolChainResponse> {
    const formattedInput = {
      input,
      rendered_tools: renderedTools,
    };

    // Invoke the tool chain with the provided input
    const response = await tool_chain.invoke(formattedInput);
    return response;

  }
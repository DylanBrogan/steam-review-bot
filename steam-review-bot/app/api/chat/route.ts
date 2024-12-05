import {  LangChainAdapter } from "ai";

import { AzureChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import { toolChainInput } from "../tools/ToolChain";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import reviewsData from '../../reviews.json'

export const maxDuration = 30;

const model = new AzureChatOpenAI({
  azureOpenAIApiDeploymentName: process.env['AZURE_OPENAI_API_DEPLOYMENT_NAME'],
  azureOpenAIApiKey: process.env['AZURE_OPENAI_API_KEY'],
  azureOpenAIApiInstanceName: process.env['AZURE_OPENAI_API_INSTANCE_NAME'],
  azureOpenAIEndpoint: process.env['AZURE_OPENAI_ENDPOINT'],
  azureOpenAIApiVersion: process.env['AZURE_OPENAI_API_VERSION'],
});

const SYSTEM_TEMPLATE = `
You are a chatbot who works with Steam reviews. 

-- TASK NUMBER ONE --
One task is to evaluate two key metrics for any review provided:
1. **Helpfulness Score**: A numerical score between 0.0 and 1.0 indicating how helpful the review is. A higher score means the review is clear, detailed, and informative, regardless of whether the review itself was positive or negative.
2. **User Recommended?**: Indicate whether the user recommends the game or not by returning either "Yes" or "No."

When a review is provided, respond in the following format:

Helpfulness Score: 0.xxxx
User Recommended?: Yes | No

You will be provided a dataset of review & helpfulness score pairs to inform your answers. You are to use this exclusively to classify the user's provided review 
based on the helpfulness score, and whether the review recommends the game or not.

  ${JSON.stringify(reviewsData)
    .replace(/{/g, '(')
    .replace(/}/g, ')')}


-- TASK NUMBER TWO --
Your second task is to output user reviews and a summary of what people think about the game. If a user provides the name of a game, a list of reviews and additional information will be provided to you.
You should output a verbose summary of the reviews, being sure to include the positives and negatives (if present). In addition print a few of the reviews provided in the tool_response output. Be sure to 
print the user's review exactly, do not alter the original user's text.

-- EXAMPLES --
TASK ONE: Steam Review Classification Examples
Example 1:  
Review: "This game is absolutely incredible! The story is immersive, and the gameplay mechanics are solid. It's worth every penny."  
Helpfulness Score: 0.565217375755310059 
User Recommended?: Yes  

Example 2:  
Review: "I didn't like this game. The controls were clunky, and it kept crashing. Avoid it."  
Helpfulness Score: 0.696473956108093262  
User Recommended?: No  

Example 3:  
Review: "The visuals are stunning, but the story feels unfinished. Multiplayer is fun, though. Mixed feelings overall."  
Helpfulness Score: 0.892233848571777344   
User Recommended?: Yes  

Example 4:  
Review: "Bad. Just bad. Waste of money."  
Helpfulness Score: 0.145257372755110659   
User Recommended?: No


TASK TWO: Game Reception Summary Example
Example 1:
USER: What do people think about The Colonists?
ASSISTANT:
Generally users recommend the game The Colonists. They like the community involvement of the developers, and the multiplayer aspects. Some players had issue with the idleness
of the game, and the portability to the steam deck.

Overall Recommended? Yes

Here are a few reviews:
1. Review by User 76561198816664378:
"If I was to say I was obsessed with this game.. It wouldn't describe it. I am craving more and more content. I can't get enough! It's amazing that I can play multiplayer with my husband too. If you like building your 'colony/city' games, this is the game for you. The developers are also super helpful and interactive. 10/10 would recommend."
🕒 Time Played: 253 hours

2. Review by User 76561198031528975:
"This game is ok, it is much more of an idle game then I thought it would be. There is a lot of waiting to build up resources and waiting for research to complete to be able to do some of the more advanced things. There are some annoyances (like not being able to upgrade a harbour to the larger one, or the whole train system being absolute dog shit), but to be honest you can get around those by not using them. Overall it is an ok game, glad I did not buy the DLC, but was ok as a casual idle background game."
🕒 Time Played: 65 hours

3. Review by User 76561198032808771:
"Played it on the switch and liked it very much. Wanted to play on the steamdeck, but unfortunately the menus are not usable. I wish you would use the same radial menu like on the switch. That was a great way of playing!"
🕒 Time Played: 6 minutes
`;

// const SYSTEM_TEMPLATE = SYSTEM_TEMPLATE_1 + JSON.stringify(reviewsData) + SYSTEM_TEMPLATE_2
const prompt = ChatPromptTemplate.fromMessages([
  ["system", SYSTEM_TEMPLATE],
  // new MessagesPlaceholder("reviewsJSON"),
  new MessagesPlaceholder("chat_history"),
  new MessagesPlaceholder("tool_response"),
  new MessagesPlaceholder("tool_response_history"),
  ["human", "{input}"],
]);

// Define expected type structure
type ConversationLogEntry = { role: 'user' | 'ai'; content: string };
type ToolLogEntry = {tool_entry: string};

// Dicts to store chat history
const conversationLog = {
  history: [] as ConversationLogEntry[]
};
const toolLog = {
  history: [] as ToolLogEntry[]
};

export const POST = async (request: Request) => {
  
  // Get user query as string
  const requestData = await request.json() as { messages: { role: "user" | "ai"; content: { type: string; text: string }[] }[] };
  const query = requestData.messages.pop();

  const tool_response = await toolChainInput(JSON.stringify(query?.content))
  const chain = RunnableSequence.from([prompt, model]);
  
  console.log("TOOL RESPONSE: Reviews:");
  if (tool_response.output.reviews) {
    tool_response.output.reviews.forEach((review: string, index: number) => {
      console.log(`Review ${index + 1}: ${JSON.stringify(review, null, 2)}`);
    });
  }
  
  console.log("Streaming response from chain")
  const stream = await chain.stream({ 
    // reviewsJSON: JSON.stringify(reviewsData),
    query, 
    chat_history: JSON.stringify(conversationLog),
    tool_response: JSON.stringify(tool_response),
    tool_response_history: JSON.stringify(toolLog),
    input: query?.content,
  });

  // Add user's message to chat history after using to generate response
  conversationLog.history.push({ role: 'user', content: query?.content[0].text as string });
  toolLog.history.push({tool_entry: JSON.stringify(tool_response)});

  return LangChainAdapter.toDataStreamResponse(stream);
};

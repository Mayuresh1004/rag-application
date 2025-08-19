"use client"

import React, { useState, } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/carrd"
import { Button } from "./components/ui/button"
import { Textarea } from "./components/ui/textarea"
import { Input } from "./components/ui/input"
import { ScrollArea } from "./components/ui/scrollarea"
import { v4 as uuidv4 } from "uuid"
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";


import { cn } from "@/app/lib/utils"




import {
  Upload,
  FileText,
  Globe,
  Send,
  Trash2,
  Database,
  Bot,
  User,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Paperclip,
} from "lucide-react"
import { Badge } from "./components/ui/badge"


interface DataSource {
  id: string
  type: "text" | "file" | "website"
  content: string
  name: string
  status: "indexed" | "processing" | "error" | "uploading" | "indexing"
}

interface ChatMessage {
  id: string
  type: "user" | "assistant"
  content: string
  timestamp: Date
}

export default function RAGApplication() {
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [textInput, setTextInput] = useState("")
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [chatInput, setChatInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [streaming, setStreaming] = useState(false);
  const [streamResponse, setstreamResponse] = useState("");

const handleTextSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!textInput.trim()) return;

  try {
    const formData = new FormData();
    formData.append("type", "text");
    formData.append("content", textInput);

    const res = await fetch("/api/indexing", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
  const text = await res.text(); // fallback to read error
  throw new Error(`API failed: ${text}`);
}
    const data = await res.json();
    console.log("Indexed:", data);

    // Optional: update UI with status
    alert(`✅ Indexed ${data.chunks} chunks from text`);
    const newSource: DataSource = {
      id: uuidv4(),
      type: "text",
      content: textInput,
      name: `Text ${dataSources.length + 1}`,
      status: "indexed",
    }
    setDataSources((prev) => [...prev, newSource])

    setTextInput(""); // clear input
  } catch (err) {
    console.error("Error indexing text:", err);
  }
};



const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const files = event.target.files;
  if (!files) return;

  for (const file of Array.from(files)) {
    const formData = new FormData();
    formData.append("type", "file");
    formData.append("file", file);

    // Optimistically update UI (status: "uploading")
    const newSource: DataSource = {
      id: uuidv4(),
      type: "file",
      content: file.name,
      name: file.name,
      status: "uploading",
    };
    setDataSources((prev) => [...prev, newSource]);

    try {
      const res = await fetch("/api/indexing", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to index file");
      const data = await res.json();

      // Update status to indexed
      setDataSources((prev) =>
        prev.map((ds) =>
          ds.id === newSource.id ? { ...ds, status: "indexed" } : ds
        )
      );
      console.log("Indexed ✅", data);
    } catch (err) {
      console.error("❌ Upload error:", err);
      setDataSources((prev) =>
        prev.map((ds) =>
          ds.id === newSource.id ? { ...ds, status: "error" } : ds
        )
      );
    }
  }

  event.target.value = "";
};

const handleWebsiteSubmit = async () => {
  if (!websiteUrl.trim()) return;

  // 1️⃣ Create source first and add it to state immediately
  const newSource: DataSource = {
    id: uuidv4(),
    type: "website",
    content: websiteUrl,
    name: new URL(websiteUrl).hostname,
    status: "indexing",
  };

  setDataSources((prev) => [...prev, newSource]);

  // 2️⃣ Prepare FormData
  const formData = new FormData();
  formData.append("type", "website");
  formData.append("url", websiteUrl);

  try {
    // 3️⃣ Call backend
    const res = await fetch("/api/indexing", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error("Failed to index website");
    const data = await res.json();

    // 4️⃣ Update status to indexed
    setDataSources((prev) =>
      prev.map((ds) =>
        ds.id === newSource.id ? { ...ds, status: "indexed" } : ds
      )
    );

    console.log("Indexed ✅", data);
  } catch (err) {
    console.error("❌ Upload error:", err);

    // 5️⃣ Update status to error
    setDataSources((prev) =>
      prev.map((ds) =>
        ds.id === newSource.id ? { ...ds, status: "error" } : ds
      )
    );
  }

  setWebsiteUrl("");
};



const handleStreamChat = async () => {
  if (!chatInput.trim()) return;

  setIsLoading(true);
  setStreaming(true);
  setstreamResponse("");

  const userMessage: ChatMessage = {
    id: uuidv4(),
    type: "user",
    content: chatInput,
    timestamp: new Date(),
  };
  setChatMessages((prev) => [...prev, userMessage]);
  setChatInput("");

  const res = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({ query: userMessage.content }),
    headers: { "Content-Type": "application/json" },
  });

  if (!res.body) {
    console.error("No response body!");
    setIsLoading(false);
    setStreaming(false);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n\n").filter(Boolean);
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.slice(6));
          setstreamResponse((prev) => prev + parsed.text);
          fullText += parsed.text;
        } catch (err) {
          console.error("Parse error", err, line);
        }
      }
    }
  }

  // Save AI response in chat
  const aiMessage: ChatMessage = {
    id: uuidv4(),
    type: "assistant",
    content: fullText || "No response found.",
    timestamp: new Date(),
  };
  setChatMessages((prev) => [...prev, aiMessage]);
  setstreamResponse("");
  setStreaming(false);
  setIsLoading(false);
};



  const removeDataSource = (id: string) => {
    setDataSources((prev) => prev.filter((source) => source.id !== id))
  }

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content)
  }

  const clearChat = () => {
    setChatMessages([])
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-100">RAG Application</h1>
          <p className="text-slate-400">Upload data and chat with your documents</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Data Input & Store */}
          <div className="space-y-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-slate-100">Add Data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Text Input */}
                <div className="space-y-2">
                  <ScrollArea className="max-h-32">
                    <Textarea
                      placeholder="Paste text content..."
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-400 min-h-20 resize-none"
                    />
                  </ScrollArea>
                  <Button
                    onClick={handleTextSubmit}
                    disabled={!textInput.trim()}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Add Text
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <Input
                      type="file"
                      multiple
                      accept=".pdf,.csv,.txt,.docx,.md"
                      onChange={handleFileUpload}
                      className="bg-slate-800 border-slate-700 text-slate-100 file:bg-emerald-600 file:text-white file:border-0 file:rounded-md file:px-3 file:py-1 file:mr-3 hover:file:bg-emerald-700 cursor-pointer"
                      id="fileUpload"
                    />
                  </div>
                  <div className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center hover:border-slate-600 transition-colors">
                    <Paperclip className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">
                      Drag & drop files here or{" "}
                      <label
                        htmlFor="fileUpload"
                        className="text-emerald-400 hover:text-emerald-300 cursor-pointer underline"
                      >
                        browse files
                      </label>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Supports PDF, CSV, TXT, DOCX, MD</p>
                  </div>
                </div>

                {/* Website URL */}
                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://example.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-400"
                  />
                  <Button
                    onClick={handleWebsiteSubmit}
                    disabled={!websiteUrl.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Globe className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800 flex-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Data Store
                  <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded-md text-sm">{dataSources.length}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80 pr-4">
                  {dataSources.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">No data sources yet</div>
                  ) : (
                    <div className="space-y-2">
                      {dataSources.map((source) => (
                        <div key={source.id} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                          <div className="flex items-center gap-2 min-w-0">
                            {source.type === "text" && <FileText className="h-4 w-4 text-slate-400" />}
                            {source.type === "file" && <Upload className="h-4 w-4 text-slate-400" />}
                            {source.type === "website" && <Globe className="h-4 w-4 text-slate-400" />}
                            <span className="text-sm text-slate-200 truncate">{source.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeDataSource(source.id)}
                            className="text-slate-400 hover:text-slate-200"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Chat */}
          <div className="lg:col-span-2">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    Chat
                    {chatMessages.length > 0 && (
                      <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded-md text-sm">
                        {chatMessages.length}
                      </span>
                    )}
                  </CardTitle>
                  {chatMessages.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearChat}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[700px] px-6 pb-4">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <Bot className="h-12 w-12 mx-auto mb-3 text-slate-600" />
                      <p>Ask questions about your data</p>
                      <p className="text-sm text-slate-500 mt-1">Upload some documents first to get started</p>
                    </div>
                  ) : (
                    chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-3 mb-4 ${message.type === "user" ? "justify-end" : "justify-start"}`}
                      >
                        {message.type === "assistant" && (
                          <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                            <Bot className="h-4 w-4 text-white" />
                          </div>
                        )}
                        <div className={`max-w-[75%] ${message.type === "user" ? "order-1" : ""}`}>
                          <div
                            className={`p-3 rounded-lg ${
                              message.type === "user"
                                ? "bg-emerald-600 text-white"
                                : "bg-slate-800 text-slate-200 border border-slate-700"
                            }`}
                          >
                        <div className="prose prose-invert max-w-none text-slate-200">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-500">{formatTime(message.timestamp)}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyMessage(message.content)}
                              className="h-6 w-6 p-0 text-slate-500 hover:text-slate-300"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            {message.type === "assistant" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-slate-500 hover:text-emerald-400"
                                >
                                  <ThumbsUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-slate-500 hover:text-red-400"
                                >
                                  <ThumbsDown className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        {message.type === "user" && (
                          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-slate-300" />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  {isLoading && (
                    <div className="flex gap-3 justify-start mb-4">
                      <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="bg-slate-800 border border-slate-700 p-3 rounded-lg">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                          <div
                            className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0.1s" }}
                          ></div>
                          <div
                            className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0.2s" }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
              <div className="px-6 pb-6 pt-4 border-t border-slate-800">
                <div className="flex gap-2">
                  <ScrollArea className="flex-1 max-h-32">
                    <Textarea
                      placeholder="Ask about your data..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleStreamChat()}
                      disabled={dataSources.length === 0 || isLoading}
                      className="bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-400 min-h-10 resize-none"
                      rows={1}
                    />
                  </ScrollArea>
                  <Button
                    onClick={handleStreamChat}
                    disabled={!chatInput.trim() || dataSources.length === 0 || isLoading}
                    className="bg-emerald-600 hover:bg-emerald-700 self-end"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
        </div>
        </div>
    
  )
}
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Hello API", description="一个简单的Hello API示例")


class NameRequest(BaseModel):
    name: str


@app.get("/")
async def root():
    return {"message": "欢迎使用Hello API！请访问 /hello 端点"}


@app.post("/hello")
async def hello(name_request: NameRequest):
    """
    接收一个名字，返回Hello消息
    
    - **name**: 用户输入的名字
    """
    return {"message": f"Hello, {name_request.name}"}


@app.get("/hello/{name}")
async def hello_get(name: str):
    """
    通过GET请求接收名字参数
    
    - **name**: 用户输入的名字（作为URL路径参数）
    """
    return {"message": f"Hello, {name}"}

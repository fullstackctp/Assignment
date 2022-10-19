import "./Editor.css";
import MagicWand from "magic-wand-tool";
import { useRef, useState } from "react";
import { concatMasks, hexToRgb } from "./Helper";

export const Editor = () => {
  const hatchOffset = 0;
  const hatchLength = 4;
  let colorThreshold = 15;

  const fileRef = useRef();
  const imageRef = useRef();
  const mask = useRef(null);
  const canvasRef = useRef();
  const oldMask = useRef(null);
  const resultingCanvasRef = useRef();

  const [image, setImage] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [downPoint, setDownPoint] = useState(null);
  const [allowDraw, setAllowDraw] = useState(false);
  const [resultingCanvas, setResultingCanvas] = useState(null);
  const [currentThreshold, setCurrentThreshold] = useState(colorThreshold);

  const [imageHistory, setImageHistory] = useState([]);

  const initCanvas = () => {
    if (canvasRef?.current && imageRef?.current) {
      canvasRef.current.width = imageRef.current.width;
      canvasRef.current.height = imageRef.current.height;

      const imageInfo = {
        width: imageRef.current.width,
        height: imageRef.current.height,
        context: canvasRef.current.getContext("2d"),
      };

      let tempCtx = document.createElement("canvas").getContext("2d");
      tempCtx.canvas.width = imageInfo.width;
      tempCtx.canvas.height = imageInfo.height;
      tempCtx.drawImage(imageRef.current, 0, 0);
      imageInfo.data = tempCtx.getImageData(0, 0, imageInfo.width, imageInfo.height);

      setImageInfo(imageInfo);

      let resultingCanvas = resultingCanvasRef.current;
      setResultingCanvas(resultingCanvas);

      let context = resultingCanvas.getContext("2d");
      resultingCanvas.height = imageRef.current.height;
      resultingCanvas.width = imageRef.current.width;
      context.drawImage(imageRef.current, 0, 0);

      setImageHistory([context.getImageData(0, 0, imageInfo.width, imageInfo.height)]);
    }
  };

  const imageChange = (event) => {
    const value = event.currentTarget;
    if (value?.files && value?.files[0]) {
      let reader = new FileReader();
      reader.onload = (e) => {
        setImage(e.target.result);
      };
      reader.readAsDataURL(value.files[0]);
    }
  };

  const uploadClickHandler = () => {
    fileRef.current.click();
  };

  const getMousePosition = (e) => {
    const parentElement = canvasRef;
    return { x: Math.round((e.clientX || e.pageX) - parentElement.current.offsetLeft), y: Math.round((e.clientX || e.pageX) - parentElement.current.offsetTop) };
  };

  const drawBorder = (noBorder) => {
    if (!mask?.current) return;

    let x,
      y,
      i,
      j,
      k,
      w = imageInfo.width,
      h = imageInfo.height,
      ctx = imageInfo.context,
      imgData = ctx.createImageData(w, h),
      res = imgData.data;

    let newCacheInd = null;
    if (!noBorder) {
      newCacheInd = MagicWand.getBorderIndices(mask?.current);
    }

    ctx.clearRect(0, 0, w, h);

    let len = newCacheInd.length;
    for (j = 0; j < len; j++) {
      i = newCacheInd[j];
      x = i % w; // calc x by index
      y = (i - x) / w; // calc y by index
      k = (y * w + x) * 4;
      if ((x + y + hatchOffset) % (hatchLength * 2) < hatchLength) {
        // detect hatch color
        res[k + 3] = 255; // black, change only alpha
      } else {
        res[k] = 255; // white
        res[k + 1] = 255;
        res[k + 2] = 255;
        res[k + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  };

  const drawMask = (x, y) => {
    if (!imageInfo) return;

    const image = {
      data: imageInfo.data.data,
      width: imageInfo.width,
      height: imageInfo.height,
      bytes: 4,
    };

    if (!oldMask.current) {
      oldMask.current = mask.current;
    }

    let old = oldMask?.current ? oldMask.current.data : null;

    mask.current = MagicWand.floodFill(image, x, y, 15, old, true);

    if (mask.current) {
      mask.current = MagicWand.gaussBlurOnlyBorder(mask.current, 5, old);
    }

    if (oldMask.current) {
      mask.current = mask.current ? concatMasks(mask.current, oldMask.current) : oldMask.current;
    }

    drawBorder();
  };

  const onMouseDownHandler = (e) => {
    if (e.button === 0) {
      setAllowDraw(true);
      const downPoint = getMousePosition(e);
      setDownPoint(downPoint);
      drawMask(downPoint.x, downPoint.y);
    } else {
      setAllowDraw(false);
    }
  };

  const onMouseUpHandler = (e) => {
    setAllowDraw(false);
    oldMask.current = null;
    setCurrentThreshold(colorThreshold);
  };

  const onMouseMoveHandler = (e) => {
    if (allowDraw) {
      let p = getMousePosition(e);
      if (p.x !== downPoint.x || p.y !== downPoint.y) {
        let dx = p.x - downPoint.x,
          dy = p.y - downPoint.y,
          len = Math.sqrt(dx * dx + dy * dy),
          adx = Math.abs(dx),
          ady = Math.abs(dy),
          sign = adx > ady ? dx / adx : dy / ady;
        sign = sign < 0 ? sign / 5 : sign / 3;
        let newThreshold = Math.min(Math.max(colorThreshold + Math.floor(sign * len), 1), 255);
        if (newThreshold !== currentThreshold) {
          setCurrentThreshold(newThreshold);
          drawMask(downPoint.x, downPoint.y);
        }
      }
    }
  };

  const cutTheSection = () => {
    if (!mask?.current) return;

    let x,
      y,
      data = mask?.current.data,
      bounds = mask?.current.bounds,
      maskW = mask?.current.width,
      w = imageInfo.width,
      h = imageInfo.height,
      ctx = imageInfo.context,
      ctx1 = resultingCanvas.getContext("2d"),
      imgData = ctx.createImageData(w, h),
      imgData1 = ctx1.createImageData(w, h),
      res = imgData.data,
      res1 = imgData1.data;

    for (y = 0; y <= h; y++) {
      for (x = 0; x <= w; x++) {
        let k = (y * w + x) * 4;
        const resultingImageData = resultingCanvas.getContext("2d").getImageData(x, y, 1, 1).data;
        if (y < bounds.minY || y >= bounds.maxY || x < bounds.minX || x >= bounds.maxX || data[y * maskW + x] == 0) {
          res1[k] = resultingImageData[0];
          res1[k + 1] = resultingImageData[1];
          res1[k + 2] = resultingImageData[2];
          res1[k + 3] = resultingImageData[3];
        }
      }
    }

    mask.current = null;

    ctx1.putImageData(imgData1, 0, 0);
    setImageHistory((pre) => [...pre, imgData1]);
  };

  const paint = (color, alpha) => {
    if (!mask?.current) return;

    let rgba = hexToRgb(color, alpha);
    let x,
      y,
      data = mask?.current.data,
      bounds = mask?.current.bounds,
      maskW = mask?.current.width,
      w = imageInfo.width,
      h = imageInfo.height,
      ctx = imageInfo.context,
      ctx1 = resultingCanvas.getContext("2d"),
      imgData = ctx.createImageData(w, h),
      imgData1 = ctx1.createImageData(w, h),
      res = imgData.data,
      res1 = imgData1.data;

    for (y = 0; y <= h; y++) {
      for (x = 0; x <= w; x++) {
        let k = (y * w + x) * 4;
        const resultingImageData = resultingCanvas.getContext("2d").getImageData(x, y, 1, 1).data;
        if (y < bounds.minY || y >= bounds.maxY || x < bounds.minX || x >= bounds.maxX || data[y * maskW + x] == 0) {
          res1[k] = resultingImageData[0];
          res1[k + 1] = resultingImageData[1];
          res1[k + 2] = resultingImageData[2];
          res1[k + 3] = resultingImageData[3];
        } else {
          res1[k] = rgba[0];
          res1[k + 1] = rgba[1];
          res1[k + 2] = rgba[2];
          res1[k + 3] = rgba[3];
        }
      }
    }
    mask.current = null;
    ctx1.putImageData(imgData1, 0, 0);
    setImageHistory((pre) => [...pre, imgData1]);
  };

  const undoHandler = () => {
    const ctx1 = resultingCanvas.getContext("2d");
    const copy = imageHistory;
    const length = copy.length;
    if (length > 1) {
      const secondLastVal = copy[length - 2];
      copy.pop();
      setImageHistory(copy);
      ctx1.putImageData(secondLastVal, 0, 0);
    }
  };

  const KeyPress = () => {
    var eventObj = window.event;
    if (eventObj.keyCode === 90 && eventObj.ctrlKey) {
      undoHandler();
    }
  };

  document.onkeydown = KeyPress;

  return (
    <div className="editor">
      <div>
        <div className="wrapper">
          {image && (
            <>
              <div className="content">
                <img src={image} id="test-picture" className="picture" alt="" ref={imageRef} onLoad={initCanvas} />
                <canvas ref={canvasRef} className="canvas" id="resultCanvas" onMouseUp={onMouseUpHandler} onMouseDown={onMouseDownHandler} onMouseMove={onMouseMoveHandler}></canvas>
              </div>
            </>
          )}
        </div>

        <div className="wrapper resulting-canvas">
          <div className="content">
            <canvas className="canvas" id="resulting-canvas" ref={resultingCanvasRef}></canvas>
          </div>
        </div>
      </div>

      <div className="buttons-container" style={{ overflow: "auto" }}>
        <button className="button" onClick={uploadClickHandler}>
          Upload image and click on it
        </button>

        <button className="button" onClick={cutTheSection}>
          Cut the selection
        </button>

        <button className="button" onClick={() => paint("000000", 0.35)}>
          Color the selection
        </button>

        <button className="button" onClick={undoHandler}>
          Undo
        </button>

        <input id="file-upload" type="file" accept="image/*" onChange={imageChange} ref={fileRef} />
      </div>
    </div>
  );
};

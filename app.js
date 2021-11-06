const express = require("express"),
  gaxios = require("gaxios"),
  app = express(),
  url = require("url"),
  cheerio = require("cherio"),
  cookieParser = require("cookie-parser");

app.use(cookieParser());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, PUT, PATCH, POST, DELETE");
  res.header(
    "Access-Control-Allow-Headers",
    req.header("access-control-request-headers")
  );
  next();
});

app.get("/api/m3u8", (req, res) => {
  gaxios
    .request({
      url: "https://titan.mediatriple.net/?br=broadcast_606c2b124aa9c",
      method: "GET",
      json: req.body,
      headers: { referer: "http://playercache.mediatriple.net/" },
    })
    .then((response) => {
      const m3u8Url = new url.URL(response.data.streams[0].url);
      res.cookie("m3u8MediaTripleHost", m3u8Url.hostname);
      const currentUrl = new url.URL(
        req.protocol + "://" + req.get("host") + req.originalUrl
      );
      m3u8Url.hostname = currentUrl.hostname;
      m3u8Url.protocol = currentUrl.protocol;
      if (process.env.NODE_ENV !== "production") {
        m3u8Url.port = app.get("port");
      }
      res.send({ url: m3u8Url });
    })
    .catch((error) => {
      console.log(error);
    });
});

// Mini reverse proxy for live stream
app.get("/:videoonlylive?/:liveCode/:smilCode/:m3u8Type", (req, res) => {
  if (
    !req.params.smilCode.includes(".smil") &&
    !req.params.smilCode.includes("broadcast")
  ) {
    res.status(404).end();
  }

  gaxios
    .request({
      url:
        "https://" +
        (req.cookies.m3u8MediaTripleHost || "b02c02nl.mediatriple.net") +
        "/videoonlylive/" +
        req.params.liveCode +
        "/" +
        req.params.smilCode +
        "/" +
        req.params.m3u8Type +
        "?md5=" +
        req.query.md5 +
        "&expires=" +
        req.query.expires,
      method: req.method,
      json: req.body,
      headers: { referer: "http://playercache.mediatriple.net/" },
      responseType: "stream",
    })
    .then(
      (response) => {
        response.data.pipe(res);
      },
      (error) => {
        //
      }
    )
    .catch((error) => {
      //
    });
});

const weatherComTranslate = (weather) => {
  switch (weather) {
    case "Orta":
      return "Az Bulutlu";
    case "Mostly Clear Night":
      return "Az Bulutlu";
    case "Partly Cloudy":
      return "Parçalı Bulutlu";
    case "Partly Cloudy Night":
      return "Parçalı Bulutlu";
    case "Mostly Sunny":
      return "Çoğunlukla Güneşli";
    case "Sunny":
      return "Güneşli";
    case "Foggy":
      return "Sisli";
    case "Clear Night":
      return "Açık";
    case "Scattered Showers":
      return "Yağmurlu";
    default:
      return weather;
  }
};

const weatherJsonBuilder = (cheerioData) => {
  const $ = cheerioData;
  let jsonData = { error: false };
  let laterElement, laterPhraseText, laterLabel, laterTemp;
  const laterElementSibling = $(
    "div.TodayWeatherCard--TableWrapper--2kEPM ul.WeatherTable--wide--3dFXu li.Column--active--3vpgg"
  );
  if (laterElementSibling) {
    laterElement = laterElementSibling.next() ?? undefined;
    laterPhraseText = weatherComTranslate(
      laterElement?.find("svg title")?.html()?.trim() ?? "error"
    );
    laterLabel = laterElement?.find("h3")?.text()?.trim() ?? "error";
    laterTemp =
      laterElement
        ?.find("div.Column--temp--5hqI_ span")
        ?.text()
        .replace("°", "")
        .trim() ?? "error";
  }

  jsonData.tempUnit = "C";
  jsonData.now = {
    temperature: $("span.CurrentConditions--tempValue--3a50n")
      .text()
      .replace("°", "")
      .trim(),
    weather: weatherComTranslate(
      $("div.CurrentConditions--phraseValue--2Z18W")?.text()?.trim() ?? "error"
    ),
    precipPhrase:
      $("div.CurrentConditions--precipValue--3nxCj span")?.text()?.trim() ??
      "error",
  };

  jsonData.daily = [];

  if (laterPhraseText !== "error") {
    jsonData.daily.push({
      dayText: laterLabel,
      temperature: laterTemp,
      weather: weatherComTranslate(laterPhraseText),
    });
  }

  const dailyWeatherData = $(
    "div.DailyWeatherCard--TableWrapper--3mjsg ul.WeatherTable--columns--OWgEl li:not(.Column--active--3vpgg)"
  );

  const tomorrowWeather = $(dailyWeatherData[0]);
  const theDayAfterTomorrowWeather = $(dailyWeatherData[1]);

  jsonData.daily.push({
    dayText: "Yarın",
    temperature:
      tomorrowWeather
        .find("div.Column--temp--5hqI_ span")
        .text()
        .replace("°", "")
        .trim() ?? "error",
    weather:
      weatherComTranslate(tomorrowWeather.find("svg title").html().trim()) ??
      "error",
  });

  jsonData.daily.push({
    dayText: theDayAfterTomorrowWeather
      .find("span.Ellipsis--ellipsis--1sNTm")
      .text(),
    temperature:
      theDayAfterTomorrowWeather
        .find("div.Column--temp--5hqI_ span")
        .text()
        .replace("°", "")
        .trim() ?? "error",
    weather:
      weatherComTranslate(
        theDayAfterTomorrowWeather.find("svg title").html().trim()
      ) ?? "error",
  });

  return jsonData;
};

app.get("/api/weather", function (req, res, next) {
  const errorJson = () => {
    return {
      error: true,
    };
  };

  gaxios
    .request({
      url: "https://weather.com/tr-TR/weather/today/l/c027c79a77e75cf682f052d9717291cc7ec6f677db4429eed536b950608f171d",
      method: "GET",
    })
    .then(
      (response) => {
        const jsonData = weatherJsonBuilder(cheerio.load(response.data));
        res.send(jsonData);
      },
      (error) => {
        if (process.env.NODE_ENV !== "production") {
          console.log(error);
        }
        res.send(errorJson());
      }
    )
    .catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.log(error);
      }
      res.send(errorJson());
    });
});

app.set("port", process.env.PORT || 3001);

app.listen(app.get("port"), function () {
  console.log("Proxy server listening on port " + app.get("port"));
});

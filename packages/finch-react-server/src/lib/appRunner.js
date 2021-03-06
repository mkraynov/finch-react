import ReactDOMServer from 'react-dom/server';
import path from 'path';
import express from 'express';
import normalize from 'normalize.css';
import uuid from 'uuid';
import {routerFactory, delay, Location, modelInitialization} from 'finch-react-routing';
import eventEmitterFactory from 'event-emitter';
import allOff from 'event-emitter/all-off';

const PAGE_INIT_TIMEOUT = process.env.PAGE_INIT_TIMEOUT || 100;
const server = global.server = express();
const webBundle = path.resolve(process.env.WEB_BUNDLE);

server.set('port', (process.env.PORT || 5000));
//server.get('/public/bundle.js', function (req, res, next) {
//  req.url = req.url + '.gz';
//  res.set('Content-Encoding', 'gzip');
//  next();
//});
server.use('/public', express.static(webBundle));

export default function ServerAppRunner(RootComponent, initialProps, rootTag) {
  const router = routerFactory(initialProps.routes);

  server.get('*', async (req, res, next) => {
    try {
      let statusCode = 200;
      let styles = {
        normalize: normalize
      };
      let context = {
        onServerStyle(id, style) {
          if (!id) {
            id = uuid.v1();
          }
          styles[id] = style;
        }
      };


      let routedComponent;
      let modelEmitter = eventEmitterFactory({});
      await router.dispatch({path: req.path, context}, (state, Component) => {
        routedComponent = <Component modelEmitter={modelEmitter} context={context} {...Object.assign({state}, state.params)} />;
      });
      if (routedComponent == null) {
        return next();
      }

      if (routedComponent.type.model) {
        await modelInitialization(routedComponent.type.model, modelEmitter, req.params, PAGE_INIT_TIMEOUT);
      }

      if (req.accepts('html')) {
        //let body = ReactDOMServer.renderToStaticMarkup(<WithContext context={context}>{routedComponent}</WithContext>);
        let body = ReactDOMServer.renderToStaticMarkup(routedComponent);
        res.status(statusCode);
        res.write(htmlHeader({
          css: Object.keys(styles)
            .map(name=>styles[name].toString())
            .join(''),
          body
        }));
        res.write("<script type='text/javascript'>");
        modelEmitter.on('model', model => {
          console.log('model', model);
          //res.write(`hydrate(${JSON.stringify(model)});`);
        });
        modelEmitter.on('end', model => {
          console.log('end', model);
          //allOff(modelEmitter);
          res.end("</script>" + htmlFooter());
        });
      } else {
        modelEmitter.on('model', model => {
          res.write(JSON.stringify(model));
        });
        modelEmitter.on('end', model => {
          allOff(modelEmitter);
          res.end();
        });
      }
    } catch (err) {
      console.log(err);
      next(err);
    }
  });
  server.listen(server.get('port'), () => {
    console.log('The server is running at http://localhost:' + server.get('port'));
  });
}

function htmlHeader({css, body}) {
  return `
    <!doctype html><html className="no-js" lang="">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no">
      <style id="server-style">${css}</style>
    </head>
    <body>
      <script>
        var script = document.createElement("script");
        script.src = '/public/bundle.js';
        document.body.appendChild(script);

        var hydrated_model = [];
        function hydrate(model) {
          hydrated_model.push(model);
        }
      </script>
      <div id="app">${body}</div>
  `;
}

function htmlFooter() {
  return `
      </body>
    </html>
  `;
}

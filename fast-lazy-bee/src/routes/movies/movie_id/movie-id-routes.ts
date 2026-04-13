import type { FastifyInstance, RouteOptions } from 'fastify';
import type { MovieSchema, MovieSchemaType } from '../../../schemas/movies/data';
import {
  type MovieIdObjectSchemaType,
  DeleteMovieSchema,
  FetchMovieSchema,
  ReplaceMovieSchema,
  UpdateMovieSchema
} from '../../../schemas/movies/http';
import { API_ENDPOINTS } from '../../../utils/constants/constants';
import {
  HttpMediaTypes,
  HttpMethods,
  HttpStatusCodes,
  RouteTags
} from '../../../utils/constants/enums';
import { addLinksToResource } from '../../../utils/hal-utils';
import { acceptsHal, registerEndpointRoutes } from '../../../utils/routing-utils';
import { PubSub } from '@google-cloud/pubsub';
import { v4 as uuidv4 } from 'uuid';

// Initialize Pub/Sub client
const pubsub = new PubSub();
const topicName = 'resource-events';


const endpoint = API_ENDPOINTS.MOVIE;
const tags: RouteTags[] = [RouteTags.MOVIE] as const;

const routes: RouteOptions[] = [
  {
    method: [HttpMethods.GET, HttpMethods.HEAD],
    url: endpoint,
    schema: { ...FetchMovieSchema, tags: [...tags, RouteTags.CACHE] },
    handler: async function fetchMovie(request, reply) {
      const params = request.params as MovieIdObjectSchemaType;
      const movie = (await this.dataStore.fetchMovie(params.movie_id)) as MovieSchemaType;

      // Publish an event to Pub/Sub when a movie is fetched
      if (movie) {
        const eventData = {
          resourceId: params.movie_id,
          resourceType: 'movie',
          timestamp: new Date().toISOString(),
          eventId: uuidv4() // IDEMPOTENCY
        };

        const dataBuffer = Buffer.from(JSON.stringify(eventData));


        pubsub.topic(topicName).publishMessage({ data: dataBuffer })
          .then((messageId) => {
            console.log(`Success: Event published to Pub/Sub with ID: ${messageId} for movie ${params.movie_id}`);
          })
          .catch((error) => console.error('Error publishing message to Pub/Sub:', error));
      }

      if (acceptsHal(request)) {
        const halMovie = addLinksToResource<typeof MovieSchema>(request, movie);
        reply
          .code(HttpStatusCodes.OK)
          .header('Content-Type', HttpMediaTypes.HAL_JSON)
          .send(halMovie);
      } else {
        reply.code(HttpStatusCodes.OK).send(movie);
      }
    }
  } as const,
  {
    method: HttpMethods.PUT,
    url: endpoint,
    schema: { ...ReplaceMovieSchema, tags },
    handler: async function replaceMovie(request, reply) {
      const params = request.params as MovieIdObjectSchemaType;
      const body = request.body as MovieSchemaType;
      await this.dataStore.replaceMovie(params.movie_id, body);
      reply.code(HttpStatusCodes.NO_CONTENT);
    }
  } as const,
  {
    method: HttpMethods.PATCH,
    url: endpoint,
    schema: { ...UpdateMovieSchema, tags },
    handler: async function updateMovie(request, reply) {
      const params = request.params as MovieIdObjectSchemaType;
      const body = request.body as MovieSchemaType;
      await this.dataStore.updateMovie(params.movie_id, body);
      reply.code(HttpStatusCodes.NO_CONTENT);
    }
  } as const,
  {
    method: HttpMethods.DELETE,
    url: endpoint,
    schema: { ...DeleteMovieSchema, tags },
    handler: async function deleteMovie(request, reply) {
      const params = request.params as MovieIdObjectSchemaType;
      await this.dataStore.deleteMovie(params.movie_id);
      reply.code(HttpStatusCodes.NO_CONTENT);
    }
  }
];

const movieRoutes = async (fastify: FastifyInstance): Promise<void> => {
  await registerEndpointRoutes(fastify, endpoint, routes);
};

export default movieRoutes;
